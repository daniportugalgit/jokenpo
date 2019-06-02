pragma solidity 0.5.0;

import "./Pausable.sol";
import "./SafeMath.sol";

//v0.90 - Only one strech goal not yet implemented: to let players bet their previous winnings.

contract JoKenPo is Pausable {
	using SafeMath for uint;

	uint public constant gracePeriod = 20; //28800; //~5 days in blocks; used to extend the deadline after player2 has played
	mapping(address => uint) public balances;

	enum Choices { NOTHING, ROCK, PAPER, SISSORS }
	mapping (bytes32 => Game) public games;
	mapping (bytes32 => bool) public pastHashedChoices; //guarantees there are no duplicates

	struct Game {
		address payable player1;
		address payable player2;
		uint betValue;
		bytes32 p1HashedChoice;
		uint8 p2Choice; //player2's choice doesn't have to be hashed!
		uint validUntilBlock;
		bool isResolved;
	}

	modifier onlyValidChoice(uint8 choice) {
		require(choice > 0 && choice < 4);
		_;
	}

	//Events:
	event LogGameCreated(address indexed player1, address indexed player2, bytes32 gameAddress, uint betValue);
	event LogGameReadyForReveal(address indexed player1, address indexed player2, bytes32 gameAddress);
	event LogGameResolved(bytes32 gameAddress, address indexed winner, uint prize);
	event LogGameCancelled(address indexed cancelledBy, bytes32 gameAddress);
	event LogUnplayedGameReclaimed(address indexed claimedBy, bytes32 gameAddress);
	event LogUnrevealedGameClaimed(address indexed claimedBy, bytes32 gameAddress);
	event LogWithdrawal(address indexed who, uint amount);

	//Player1 creates a new game:
	//@return game address
	function createNewGame(address payable adversary, bytes32 hashedP1Choice, uint deadlineInBlocks) onlyReady public payable returns (bytes32) {
		bytes32 targetGameAddress = getGameAddress(adversary, hashedP1Choice);
		require(games[targetGameAddress].player1 == address(0), "Game already exists. Please change your choice password.");
		require(pastHashedChoices[hashedP1Choice] == false, "Password has already been used. Please change your choice password.");
		require(msg.sender != adversary, "You cannot play against yourself.");

		games[targetGameAddress] = Game(msg.sender, adversary, msg.value, hashedP1Choice, 0, block.number + deadlineInBlocks, false);
		pastHashedChoices[hashedP1Choice] = true; //burn the chosen password

		emit LogGameCreated(msg.sender, adversary, targetGameAddress, msg.value);

		return targetGameAddress;
	}

	//System uses this to create an address for the game:
	function getGameAddress(address adversary, bytes32 hashedP1Choice) private view returns (bytes32) {
		return keccak256(abi.encodePacked(address(this), adversary, hashedP1Choice));
	}

	//Player1 uses this function to get the hash of her choice before creating a game:
	function getHashedChoice(uint8 choice, address adversary, string memory password) onlyValidChoice(choice) public view returns (bytes32) {
		require(adversary != address(0));

		return keccak256(abi.encodePacked(address(this), msg.sender, adversary, choice, password));
	}

	//Player2 plays:
	function betInExistingGame(bytes32 gameAddress, uint8 p2Choice) onlyValidChoice(p2Choice) onlyReady public payable {
		require(games[gameAddress].player1 != address(0), "Game not found. Please check the provided game address.");
		require(games[gameAddress].player2 == msg.sender, "Only player2 may call this function.");
		require(games[gameAddress].p2Choice == 0, "A bet had already been placed for player2.");
		require(games[gameAddress].validUntilBlock >= block.number, "This game has expired and you forfeited your right to win.");
		require(!games[gameAddress].isResolved, "This game has been cancelled by player1.");
		require(msg.value == games[gameAddress].betValue, "Wrong bet value.");

		games[gameAddress].player2 = msg.sender; 
		games[gameAddress].p2Choice = p2Choice; //it's already revealed!
		games[gameAddress].validUntilBlock = block.number + gracePeriod; //extends deadline for player1 to reveal

		emit LogGameReadyForReveal(games[gameAddress].player1, msg.sender, gameAddress);
	}

	//Player1 reveals the choice she made and the game is resolved:
	function revealChoice(bytes32 gameAddress, uint8 choice, string memory password) onlyReady public {
		require(games[gameAddress].player1 == msg.sender, "Only player1 may call this function.");
		require(games[gameAddress].player2 != address(0), "Please wait until player2 has played.");
		require(!games[gameAddress].isResolved, "This game has already ended.");
		require(getHashedChoice(choice, games[gameAddress].player2, password) == games[gameAddress].p1HashedChoice, "Choice did not match.");

		address winner;
		uint8 winnerIndex = getWinner(choice, uint8(games[gameAddress].p2Choice));

		if(winnerIndex == 0) {
			//Draw:
			balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue);
			balances[games[gameAddress].player2] = balances[games[gameAddress].player2].add(games[gameAddress].betValue);
			winner = address(0);
		} else if (winnerIndex == 1) {
			//P1 won:
			balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue.mul(2));
			winner = msg.sender;
		} else {
			//P2 won:
			balances[games[gameAddress].player2] = balances[games[gameAddress].player2].add(games[gameAddress].betValue.mul(2));
			winner = games[gameAddress].player2;
		}

		games[gameAddress].isResolved = true;

		emit LogGameResolved(gameAddress, winner, games[gameAddress].betValue.mul(2));
	}

	function getWinner(uint8 p1Choice, uint8 p2Choice) private pure returns(uint8) {
		if(p1Choice == p2Choice) { return 0; } //DRAW
		if((p1Choice > p2Choice && !(p1Choice == 3 && p2Choice == 1)) || (p1Choice == 1 && p2Choice == 3)) { return 1; } //P1 Wins
		return 2; //P2 Wins (if P1 tried to cheat by using an invalid hash, P2 wins)
	}

	//Player1 may cancel the game before player2 plays:
	function cancelGame(bytes32 gameAddress) onlyReady public {
		require(games[gameAddress].player1 == msg.sender, "Only player1 may call this function."); //this also guarantees the game exists
		require(games[gameAddress].p2Choice == 0, "Player2 has already played. This game cannot be cancelled anymore.");

		games[gameAddress].isResolved = true;
		balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue);

		emit LogGameCancelled(msg.sender, gameAddress);
	}

	//Player1 may claim back the prize in case player2 does not play until the deadline:
	function claimUnplayedGameBalance(bytes32 gameAddress) onlyReady public {
		require(games[gameAddress].player1 == msg.sender, "Only player1 may call this function."); //this also guarantees the game exists
		require(games[gameAddress].p2Choice == 0, "Player2 has already played!");
		require(!games[gameAddress].isResolved, "This game has already ended.");
		require(games[gameAddress].validUntilBlock < block.number, "This game has not expired yet.");

		games[gameAddress].isResolved = true;
		balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue);

		emit LogUnplayedGameReclaimed(msg.sender, gameAddress);
	}

	//Player2 may claim the prize in case player1 does not reveal his choice until the extended deadline (grace period):
	function claimUnrevealedGameBalance(bytes32 gameAddress) onlyReady public {
		require(games[gameAddress].player2 == msg.sender, "Only player2 may call this function."); //this also guarantees the game exists
		require(!games[gameAddress].isResolved, "This game has already ended.");
		require(games[gameAddress].validUntilBlock < block.number, "This game has not expired yet.");

		games[gameAddress].isResolved = true;
		balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue.mul(2));

		emit LogUnrevealedGameClaimed(msg.sender, gameAddress);
	}

	function withdraw() onlyReady public {
		uint amount = balances[msg.sender];
		require(amount > 0, "Insufficient funds.");
		
		emit LogWithdrawal(msg.sender, amount);
		balances[msg.sender] = 0;
		msg.sender.transfer(amount);
	}

	//In newer versions this is default behavior, but we'll make it explicit here:
	function() external {
		revert();
	}
}