const timeTravel = require("./utils/timeTravel");
const balanceCheck = require("./utils/balanceCheck");
const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

const addressZero = "0x0000000000000000000000000000000000000000";
const defaultP1Choice = 2; //PAPER
const defaultP2Choice = 1; //ROCK
const defaultPassword = "testPassword";
const deadline = 10;
const gracePeriod = 20; //28800 would be ~5 days, but for testing let's leave it at 20;

/*
HAPPY PATHS (first part):
1) It should create a game
2) It should bet in existing game
3) It should reveal choice and winner

GAME LOGIC:
A) P1 should win if p1Choice == PAPER (2) && p2Choice == ROCK (1)
B) P1 should win if p1Choice == SCISSORS (3) && p2Choice == PAPER (2)
C) P1 should win if p1Choice == ROCK (1) && p2Choice == SCISSORS (3)
D) P2 should win if p2Choice == PAPER (2) && p1Choice == ROCK (1)
E) P2 should win if p2Choice == SCISSORS (3) && p1Choice == PAPER (2)
F) P2 should win if p2Choice == ROCK (1) && p1Choice == SCISSORS (3)
G) DRAW if p1Choice == ROCK && p2Choice == ROCK
H) DRAW if p1Choice == PAPER && p2Choice == PAPER
I) DRAW if p1Choice == SCISSORS && p2Choice == SCISSORS

HAPPY PATHS (second part):
4) It should cancel a game
5) It should claim an unrevealed game
6) It should withdraw
7) It should bet in existing game sending less than betAmount if p2 has enough balance
8) It should give p2 the change when he sends more ETH than needed in a bet

EXCEPTIONS:
1.1) It should fail to create game if the game ID already exists
1.2) It should fail to create game if the password has already been used
1.3) It should fail to create game if adversary == msg.sender
1.4) It should fail to generate hash if choice is invalid

2.1) It should fail to bet in non-existent game
2.2) It should fail to bet in existing game if msg.sender != player2
2.3) It should fail to bet in existing game if player2 has already bet
2.4) It should fail to bet in existing game if it has already expired
2.5) It should fail to bet in existing game if it has been cancelled
2.6) It should fail to bet in existing game if msg.value + p2Balance < game.betValue
2.7) It should fail to bet in existing game if choice is invalid

3.1) It should fail to reveal choice if msg.sender != player1
3.2) It should fail to reveal choice if player2 has not played yet
3.3) It should fail to reveal choice if game has already ended
3.4) It should fail to reveal choice if the provided choice does not match

4.1) It should fail to cancel game if msg.sender != player1
4.2) It should fail to cancel game if player2 has already played
4.3) It should fail to cancel game if game has already ended

5.1) It should fail to claim an unrevealed game if msg.sender != player2
5.2) It should fail to claim an unrevealed game if game has already ended
5.3) It should fail to claim an unrevealed game if game has not expired yet

6.1) It should fail to withdraw if balance <= 0
*/

contract("JoKenPo", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

	
	it("1) should create a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		let gameObject = await _instance.games.call(hashedChoice, {from: account1});
		let validUntilBlock = await web3.eth.getBlockNumber();
		validUntilBlock += deadline;

		assert.strictEqual(gameObject.player1, account1, "Game has not registered its creator.");
		assert.strictEqual(gameObject.player2, account2, "Game has not registered player2.");
		assert.strictEqual(gameObject.betValue.toString(10), "100", "Game has registered wrong betValue.");
		assert.strictEqual(gameObject.p2Choice.toString(10), "0", "Game should not have a p2Choice right now.");
		assert.strictEqual(gameObject.validUntilBlock.toString(10), validUntilBlock.toString(10), "Game has not registered the correct deadline.");
	});

	it("2) should bet in existing game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		
		let gameObject = await _instance.games.call(hashedChoice, {from: account1});
		let validUntilBlock = await web3.eth.getBlockNumber();
		validUntilBlock += gracePeriod;
		
		assert.strictEqual(gameObject.player1, account1, "Game has changed its creator.");
		assert.strictEqual(gameObject.player2, account2, "Game changed player2.");
		assert.strictEqual(gameObject.betValue.toString(10), "100", "Game has changed betValue.");
		assert.strictEqual(gameObject.p2Choice.toString(10), defaultP2Choice.toString(10), "Game has not registered p2Choice.");
		assert.strictEqual(gameObject.validUntilBlock.toString(10), validUntilBlock.toString(10), "Game has not registered the correct extended deadline.");
	});

	it("3) should reveal choice and winner", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == account1;
		});

		let gameObject = await _instance.games.call(hashedChoice, {from: account1});
		assert.strictEqual(gameObject.validUntilBlock.toString(10), "0", "Game should be resolved.");

		let balance1 = await _instance.balances.call(account1);
		assert.strictEqual(balance1.toString(10), "200", "Wrong balance found.");
	});

	it("A) P1 should win if p1Choice == PAPER (2) && p2Choice == ROCK (1)", async () => {
		let expectedWinner = account1;
		let p1Choice = 2; //PAPER
		let p2Choice = 1; //ROCK

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("B) P1 should win if p1Choice == SCISSORS (3) && p2Choice == PAPER (2)", async () => {
		let expectedWinner = account1;
		let p1Choice = 3; //SCISSORS
		let p2Choice = 2; //PAPER

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("C) P1 should win if p1Choice == ROCK (1) && p2Choice == SCISSORS (3)", async () => {
		let expectedWinner = account1;
		let p1Choice = 1; //ROCK
		let p2Choice = 3; //SCISSORS

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("D) P2 should win if p2Choice == PAPER (2) && p1Choice == ROCK (1)", async () => {
		let expectedWinner = account2;
		let p1Choice = 1; //ROCK
		let p2Choice = 2; //PAPER

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("E) P2 should win if p2Choice == SCISSORS (3) && p1Choice == PAPER (2)", async () => {
		let expectedWinner = account2;
		let p1Choice = 2; //PAPER
		let p2Choice = 3; //SCISSORS

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("F) P2 should win if p2Choice == ROCK (1) && p1Choice == SCISSORS (3)", async () => {
		let expectedWinner = account2;
		let p1Choice = 3; //SCISSORS
		let p2Choice = 1; //ROCK

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("G) DRAW if p1Choice == ROCK && p2Choice == ROCK", async () => {
		let expectedWinner = addressZero;
		let p1Choice = 1; //ROCK
		let p2Choice = 1; //ROCK

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("H) DRAW if p1Choice == PAPER && p2Choice == PAPER", async () => {
		let expectedWinner = addressZero;
		let p1Choice = 2; //PAPER
		let p2Choice = 2; //PAPER

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("I) DRAW if p1Choice == SCISSORS && p2Choice == SCISSORS", async () => {
		let expectedWinner = addressZero;
		let p1Choice = 3; //SCISSORS
		let p2Choice = 3; //SCISSORS

		let hashedChoice = await _instance.getHashedChoice.call(p1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, p2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(hashedChoice, p1Choice, defaultPassword, {from: account1});
		
		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.winner == expectedWinner;
		});
	});

	it("4) should cancel a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await timeTravel.advanceManyBlocks(deadline + 1);
		await _instance.cancelGame(hashedChoice, {from: account1});
		let gameObject = await _instance.games.call(hashedChoice, {from: account1});
		
		assert.strictEqual(gameObject.validUntilBlock.toString(10), "0", "Game should be resolved right now.");

		let balance1 = await _instance.balances.call(account1);
		assert.strictEqual(balance1.toString(10), "100", "Wrong balance found.");
	});

	it("5) should claim an unrevealed game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(hashedChoice, {from: account2});

		let gameObject = await _instance.games.call(hashedChoice, {from: account1});
		assert.strictEqual(gameObject.validUntilBlock.toString(10), "0", "Game should be resolved right now.");

		let balance2 = await _instance.balances.call(account2);
		assert.strictEqual(balance2.toString(10), "200", "Wrong balance found.");
	});

	it("6) should withdraw", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(hashedChoice, {from: account2});
		await balanceCheck.balanceDiff(_instance.withdraw({from:account2}), account2, 200, "Did not withdraw the correct amount.");
	});

	it("7) should bet in existing game with msg.value < betAmount if p2 has enough balance", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(hashedChoice, {from: account2}); //p2 has 200 wei by now;
		
		let hashedChoice2 = await _instance.getHashedChoice.call(defaultP1Choice, account2, "somethingElse", {from: account1});
		await _instance.createNewGame(account2, hashedChoice2, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice2, defaultP2Choice, {from: account2, value:50});

		let balance2 = await _instance.balances.call(account2);
		assert.strictEqual(balance2.toString(10), "150", "Wrong balance found.");
	});

	it("8) should give p2 the change when he sends more ETH than needed in a bet", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:150});
		
		let balance2 = await _instance.balances.call(account2);
		assert.strictEqual(balance2.toString(10), "50", "Wrong balance found.");
	});

	it("1.1) should fail to create game if the game ID already exists", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});		
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100}), truffleAssert.ErrorType.REVERT, "Duplicated game ID");
	});

	it("1.2) should fail to create game if the password has already been used", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.createNewGame(account3, hashedChoice, deadline, {from: account1, value:100}), truffleAssert.ErrorType.REVERT, "Duplicated password");
	});

	it("1.3) should fail to create game if adversary == msg.sender", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account1, defaultPassword, {from: account1});
		await truffleAssert.reverts(_instance.createNewGame(account1, hashedChoice, deadline, {from: account1, value:100}), truffleAssert.ErrorType.REVERT, "adversary == msg.sender");
	});

	it("1.4) should fail to generate hash if choice is invalid", async () => {	
		await truffleAssert.reverts(_instance.getHashedChoice.call(4, account2, defaultPassword, {from: account1}), truffleAssert.ErrorType.REVERT, "Invalid choice");
	});

	it("2.1) should fail to bet in non-existent game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "Bet in non-existent game");
	});

	it("2.2) should fail to bet in existing game if msg.sender != player2", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account1, value:100}), truffleAssert.ErrorType.REVERT, "msg.sender != player2");
	});

	it("2.3) should fail to bet in existing game if player2 has already bet", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100})
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "Double bet");
	});

	it("2.4) should fail to bet in existing game if it has already expired", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await timeTravel.advanceManyBlocks(deadline + 1);
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "Bet in expired game");
	});

	it("2.5) should fail to bet in existing game if it has been cancelled", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await timeTravel.advanceManyBlocks(deadline + 1);
		await _instance.cancelGame(hashedChoice, {from: account1});
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "Bet in cancelled game");
	});

	it("2.6) should fail to bet in existing game if msg.value + p2Balance < game.betValue", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:99}), truffleAssert.ErrorType.REVERT, "Bet with wrong msg.value");
	});

	it("2.7) should fail to bet in existing game if choice is invalid", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, 4, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "Bet with invalid choice");
	});

	it("3.1) should fail to reveal choice if msg.sender != player1", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await truffleAssert.reverts(_instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account2}), truffleAssert.ErrorType.REVERT, "msg.sender != player1");
	});

	it("3.2) should fail to reveal choice if player2 has not played yet", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account2}), truffleAssert.ErrorType.REVERT, "reveal incomplete game");
	});

	it("3.3) should fail to reveal choice if game has already ended", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await _instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1})
		await truffleAssert.reverts(_instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1}), truffleAssert.ErrorType.REVERT, "Double reveal");
	});

	it("3.4) should fail to reveal choice if the provided choice does not match", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await truffleAssert.reverts(_instance.revealChoice(hashedChoice, 3, defaultPassword, {from: account1}), truffleAssert.ErrorType.REVERT, "Reveal with wrong choice");
	});

	it("4.1) should fail to cancel game if msg.sender != player1", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await truffleAssert.reverts(_instance.cancelGame(hashedChoice, {from: account2}), truffleAssert.ErrorType.REVERT, "msg.sender != player1");
	});

	it("4.2) should fail to cancel game if player2 has already played", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await truffleAssert.reverts(_instance.cancelGame(hashedChoice, {from: account1}), truffleAssert.ErrorType.REVERT, "msg.sender != player1");
	});

	it("4.3) should fail to cancel game if game has already ended", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await _instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1})
		await truffleAssert.reverts(_instance.cancelGame(hashedChoice, {from: account1}), truffleAssert.ErrorType.REVERT, "msg.sender != player1");
	});

	it("5.1) should fail to claim an unrevealed game if msg.sender != player2", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await truffleAssert.reverts(_instance.claimUnrevealedGameBalance(hashedChoice, {from: account3}), truffleAssert.ErrorType.REVERT, "msg.sender != player2");
	});

	it("5.2) should fail to claim an unrevealed game if game has already ended", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await _instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1})
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await truffleAssert.reverts(_instance.claimUnrevealedGameBalance(hashedChoice, {from: account2}), truffleAssert.ErrorType.REVERT, "game has already ended");
	});

	it("5.3) should fail to claim an unrevealed game if game has not expired yet", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod - 1);
		await truffleAssert.reverts(_instance.claimUnrevealedGameBalance(hashedChoice, {from: account2}), truffleAssert.ErrorType.REVERT, "game has not expired yet");
	});

	it("6.1) should fail to withdraw if balance <= 0", async () => {
		await truffleAssert.reverts(_instance.withdraw({from:account2}), truffleAssert.ErrorType.REVERT, "withdraw with balance <= 0");
	});
});