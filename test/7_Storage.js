const getStorage = require("./utils/getStorage");
const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

const defaultP1Choice = 2; //PAPER
const defaultP2Choice = 1; //ROCK
const defaultPassword = "testPassword";
const deadline = 10;

//This is just for fun, I don't think I need to test it like this.
contract("Storage tests", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

	it("Where in storage is balances? How much is balances[account2]?", async () => {
		let hashedChoice = await _instance.getHashedChoice.call(defaultP1Choice, account2, defaultPassword, {from: account1});
		await _instance.createNewGame(account2, hashedChoice, deadline, {from: account1, value:100});
		await _instance.betInExistingGame(hashedChoice, defaultP2Choice, {from: account2, value:150});
		
		let balance2 = await _instance.balances.call(account2);
		assert.strictEqual(balance2.toString(10), "50", "Wrong balance found.");

		//Finds the mapping, in case we don't know were it is:
		var targetSlot;
		var result;
		for(targetSlot = 0; targetSlot < 10; targetSlot++) {
			result = await getStorage.atMapping(_instance.address, targetSlot, account2);
			if(result != "0x0") console.log("Slot " + targetSlot + ": " + result);
		}
	});
});