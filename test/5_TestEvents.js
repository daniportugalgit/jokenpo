const timeTravel = require("./timeTravel/timeTravel");
const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

const defaultP1Choice = 2; //PAPER
const defaultP2Choice = 1; //ROCK
const defaultPassword = "testPassword";
const deadline = 10;
const gracePeriod = 20; //28800 would be ~5 days, but for testing let's leave it at 20;

/*
event LogGameCreated(address indexed player1, address indexed player2, bytes32 gameAddress, uint betValue);
event LogGameReadyForReveal(address indexed player1, address indexed player2, bytes32 gameAddress);
event LogGameResolved(bytes32 gameAddress, address indexed winner, uint prize);
event LogGameCancelled(address indexed cancelledBy, bytes32 gameAddress);
event LogUnplayedGameReclaimed(address indexed claimedBy, bytes32 gameAddress);
event LogUnrevealedGameClaimed(address indexed claimedBy, bytes32 gameAddress);
event LogWithdrawal(address indexed who, uint amount);
*/

contract("should emit events when", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

    it("Ev1) a game is created", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		let result = await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});

		await truffleAssert.eventEmitted(result, 'LogGameCreated', (ev) => {
			return ev.player1 == account1 && ev.player2 == account2 && ev.gameAddress == gameAddress && ev.betValue == 100;
		});
	});

	it("Ev2) a game is ready for reveal", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		let result = await _instance.betInExistingGame(gameAddress, defaultP2Choice, {from: account2, value:100});

		await truffleAssert.eventEmitted(result, 'LogGameReadyForReveal', (ev) => {
			return ev.player1 == account1 && ev.player2 == account2 && ev.gameAddress == gameAddress;
		});
	});

	it("Ev3) a game is resolved", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(gameAddress, defaultP2Choice, {from: account2, value:100});
		let result = await _instance.revealChoice(gameAddress, defaultP1Choice, defaultPassword, {from: account1});

		await truffleAssert.eventEmitted(result, 'LogGameResolved', (ev) => {
			return ev.gameAddress == gameAddress && ev.winner == account1 && ev.prize == 200;
		});
	});

	it("Ev4) a game is cancelled", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		let result = await _instance.cancelGame(gameAddress, {from: account1});

		await truffleAssert.eventEmitted(result, 'LogGameCancelled', (ev) => {
			return ev.cancelledBy == account1 && ev.gameAddress == gameAddress;
		});
	});

	it("Ev5) an unplayed game is reclaimed", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await timeTravel.advanceManyBlocks(deadline + 1);
		let result = await _instance.claimUnplayedGameBalance(gameAddress, {from: account1});

		await truffleAssert.eventEmitted(result, 'LogUnplayedGameReclaimed', (ev) => {
			return ev.claimedBy == account1 && ev.gameAddress == gameAddress;
		});
	});

	it("Ev6) an unrevealed game is claimed", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(gameAddress, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		let result = await _instance.claimUnrevealedGameBalance(gameAddress, {from: account2});

		await truffleAssert.eventEmitted(result, 'LogUnrevealedGameClaimed', (ev) => {
			return ev.claimedBy == account2 && ev.gameAddress == gameAddress;
		});
	});

	it("Ev7) someone withdraws", async () => {
    	let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		let gameAddress = await _instance.createNewGame.call(account2, hashedChoice, deadline, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(gameAddress, defaultP2Choice, {from: account2, value:100});
		await timeTravel.advanceManyBlocks(gracePeriod + 1);
		await _instance.claimUnrevealedGameBalance(gameAddress, {from: account2});
		let result = await _instance.withdraw({from: account2});

		await truffleAssert.eventEmitted(result, 'LogWithdrawal', (ev) => {
			return ev.who == account2 && ev.amount == 200;
		});
	});
});