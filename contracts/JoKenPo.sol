pragma solidity 0.5.0;

import "./Pausable.sol";
import "./SafeMath.sol";

//v1.00: I think it's done!

contract JoKenPo is Pausable {
	using SafeMath for uint;

	uint public constant gracePeriod = 20; //28800; //~5 days in blocks; used to extend the deadline after player2 has played
	mapping(address => uint) public balances;

	enum Choices { NOTHING, ROCK, PAPER, SCISSORS }
	mapping (bytes32 => Game) public games;

	struct Game {
		address payable player1;
		address payable player2;
		uint betValue;
		uint8 p2Choice;
		uint validUntilBlock;
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
	event LogUnrevealedGameClaimed(address indexed claimedBy, bytes32 gameAddress);
	event LogWithdrawal(address indexed who, uint amount);

	//Player1 creates a new game:
	//@return game address
	function createNewGame(address payable adversary, bytes32 hashedP1Choice, uint deadlineInBlocks) onlyRunning public payable {
		require(games[hashedP1Choice].player1 == address(0), "Game already exists. Please change your choice password.");
		require(msg.sender != adversary, "You cannot play against yourself.");

		games[hashedP1Choice] = Game(msg.sender, adversary, msg.value, 0, block.number + deadlineInBlocks);
	
		emit LogGameCreated(msg.sender, adversary, hashedP1Choice, msg.value);
	}

	//Player1 uses this function to get the hash of her choice before creating a game:
	function getHashedChoice(uint8 choice, address adversary, string memory password) onlyValidChoice(choice) public view returns (bytes32) {
		require(adversary != address(0));

		return keccak256(abi.encodePacked(address(this), msg.sender, adversary, choice, password));
	}

	//Player2 plays:
	function betInExistingGame(bytes32 gameAddress, uint8 p2Choice) onlyValidChoice(p2Choice) onlyRunning public payable {
		address p1 = games[gameAddress].player1; //avoiding multiple SLOADs
		uint betVal = games[gameAddress].betValue; //avoiding multiple SLOADs
		uint p2Balance = balances[msg.sender]; //avoiding multiple SLOADs

		require(p1 != address(0), "Game not found. Please check the provided game address.");
		require(games[gameAddress].player2 == msg.sender, "Either you are not player2, or this game has been cancelled/resolved.");
		require(games[gameAddress].p2Choice == 0, "A bet had already been placed for player2.");
		require(games[gameAddress].validUntilBlock >= block.number, "This game has expired and you forfeited your right to win.");
		require(msg.value + p2Balance >= betVal, "Insufficient funds. Please send more ETH.");

		if(msg.value > betVal) {
			//return some money to p2:
			balances[msg.sender] = p2Balance.add(msg.value - betVal);
		} else if(msg.value < betVal) {
			//get some money from p2 to complete the bet:
			balances[msg.sender] = p2Balance.sub(betVal - msg.value); //SafeMath will revert if p2 has not enough funds (but, above, we require enough money anyway)
		} else {
			//do nothing, because p2 sent the exact expected amount
		}

		games[gameAddress].player2 = msg.sender; 
		games[gameAddress].p2Choice = p2Choice;
		games[gameAddress].validUntilBlock = block.number + gracePeriod; //extends deadline for player1 to reveal

		emit LogGameReadyForReveal(p1, msg.sender, gameAddress);
	}

	//Player1 reveals the choice she made and the game is resolved:
	function revealChoice(bytes32 gameAddress, uint8 choice, string memory password) onlyRunning public {
		address p2 = games[gameAddress].player2; //avoiding multiple SLOADs
		uint8 p2Choice = games[gameAddress].p2Choice; //avoiding multiple SLOADs

		require(games[gameAddress].player1 == msg.sender, "Only player1 may call this function.");
		require(p2Choice != 0, "Either player2 has not played yet, or this game has already been cancelled/resolved.");
		require(getHashedChoice(choice, p2, password) == gameAddress, "Choice did not match.");

		address winner;
		uint8 winnerIndex = getWinner(choice, p2Choice);

		if(winnerIndex == 0) {
			//Draw:
			balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue);
			balances[p2] = balances[p2].add(games[gameAddress].betValue);
			winner = address(0);
		} else if (winnerIndex == 1) {
			//P1 won:
			balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue.mul(2)); //SafeMath will revert on overflow
			winner = msg.sender;
		} else {
			//P2 won:
			balances[p2] = balances[p2].add(games[gameAddress].betValue.mul(2)); //SafeMath will revert on overflow
			winner = p2;
		}

		emit LogGameResolved(gameAddress, winner, games[gameAddress].betValue.mul(2)); //SafeMath will revert on overflow
		freeGameStorage(gameAddress);
	}

	function freeGameStorage(bytes32 gameAddress) private {
		//games[gameAddress].player1 = 0; //We actually shan't clear this one
		games[gameAddress].player2 = address(0);
		games[gameAddress].betValue = 0;
		games[gameAddress].p2Choice = 0;
		games[gameAddress].validUntilBlock = 0;
	}

	function getWinner(uint8 p1Choice, uint8 p2Choice) private pure returns(uint8) {
		if(p1Choice == p2Choice) { return 0; } //DRAW
		if((p1Choice > p2Choice && !(p1Choice == 3 && p2Choice == 1)) || (p1Choice == 1 && p2Choice == 3)) { return 1; } //P1 Wins
		return 2; //P2 Wins (if P1 tried to cheat by using an invalid hash, P2 wins)
	}

	//Player1 may cancel the game (before player2 plays AND after the deadline has expired):
	function cancelGame(bytes32 gameAddress) onlyRunning public {
		uint deadline = games[gameAddress].validUntilBlock; //avoiding multiple SLOADs
		require(games[gameAddress].player1 == msg.sender, "Only player1 may call this function."); //this also guarantees the game exists
		require(games[gameAddress].p2Choice == 0, "Player2 has already played. This game cannot be cancelled anymore.");
		require(block.number > deadline, "You cannot cancel a game before the deadline has expired."); //this flow prevents a front-running vulnerability
		require(deadline != 0, "This game has already been resolved.");

		balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue);
		freeGameStorage(gameAddress);

		emit LogGameCancelled(msg.sender, gameAddress);
	}

	//Player2 may claim the prize in case player1 does not reveal his choice until the extended deadline (grace period):
	function claimUnrevealedGameBalance(bytes32 gameAddress) onlyRunning public {
		uint deadline = games[gameAddress].validUntilBlock;
		require(games[gameAddress].player2 == msg.sender, "Only player2 may call this function."); //this also guarantees the game exists
		require(deadline != 0, "This game has already ended.");
		require(deadline < block.number, "This game has not expired yet.");

		balances[msg.sender] = balances[msg.sender].add(games[gameAddress].betValue.mul(2));
		freeGameStorage(gameAddress);

		emit LogUnrevealedGameClaimed(msg.sender, gameAddress);
	}

	function withdraw() onlyRunning public {
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