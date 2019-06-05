const timeTravel = require("./utils/timeTravel");
const balanceCheck = require("./utils/balanceCheck");
const txUtils = require("./utils/txUtils");
const getStorage = require("./utils/getStorage");
const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

const addressZero = "0x0000000000000000000000000000000000000000";
const defaultP1Choice = 2; //PAPER
const defaultP2Choice = 1; //ROCK
const defaultPassword = "testPassword";
const deadline = 10;
const gracePeriod = 20; //28800 would be ~5 days, but for testing let's leave it at 20;

/*
1) create a game
2) bet in existing game
3) reveal choice and winner
4) cancel a game
5) claim an unrevealed game
6) withdraw
*/
contract("Gas costs", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

	it("1) Create a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		await txUtils.printGasAndFee(_instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100}), "createNewGame", true);
	});

	it("2) Bet in existing game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await txUtils.printGasAndFee(_instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100}), "betInExistingGame", true);
	});

	it("3) Reveal choice and winner", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await txUtils.printGasAndFee(_instance.revealChoice(hashedChoice, defaultP1Choice, defaultPassword, {from: account1}), "revealChoice", true);
	});

	it("4) Cancel a game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await timeTravel.advanceManyBlocks(deadline + 1);
		await txUtils.printGasAndFee(_instance.cancelGame(hashedChoice, {from: account1}), "cancelGame", true);
	});

	it("5) Claim an unrevealed game", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await txUtils.printGasAndFee(_instance.claimUnrevealedGameBalance(hashedChoice, {from: account2}), "claimUnrevealedGameBalance", true);
	});

	it("6) Withdraw", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(hashedChoice, {from: account2});
		await txUtils.printGasAndFee(_instance.withdraw({from:account2}), "withdraw", true);
	});
});