const timeTravel = require("./timeTravel/timeTravel");
const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

const defaultP1Choice = 2; //PAPER
const defaultP2Choice = 1; //ROCK
const defaultPassword = "testPassword";
const deadline = 10;
const gracePeriod = 20; //28800 would be ~5 days, but for testing let's leave it at 20;

/*

When paused/frozen:
1) It should fail to create a game
2) It should fail to bet in existing game
3) It should fail to reveal choice and winner
4) It should fail to cancel a game
5) It should fail to claim an unrevealed game
6) It should fail to withdraw

# Whenever the state is frozen, it is also paused by design, therefore we don't need to test it specifically.
*/

contract("When Paused or Frozen, should fail to", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

	
	it("1.x) create a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100}), truffleAssert.ErrorType.REVERT, "create game when paused");
	});
	

	it("2.x) bet in existing game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), truffleAssert.ErrorType.REVERT, "bet when paused");
	});

	it("3.x) reveal choice and winner", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1}), truffleAssert.ErrorType.REVERT, "reveal when paused");
	});

	it("4.x) cancel a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.cancelGame(hashedChoice, {from: account1}), truffleAssert.ErrorType.REVERT, "cancel when paused");
	});

	it("5.x) claim an unrevealed game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.claimUnrevealedGameBalance(hashedChoice, {from: account2}), truffleAssert.ErrorType.REVERT, "claim unrevealed when paused");
	});

	it("6.x) withdraw", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(hashedChoice, {from: account2});
		await _instance.pause({ from:account0 });
		await truffleAssert.reverts(_instance.withdraw({from:account2}), truffleAssert.ErrorType.REVERT, "Withdraw when paused");
	});
});