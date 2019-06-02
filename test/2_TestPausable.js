const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

/*
1) Pause if is owner
2) Pause: revert if not owner
3) Pause: emit event

4) Resume if paused && is owner
5) Resume: revert if not paused
6) Resume: revert if not owner
7) Resume: emit event

8) Freeze if paused && is owner
9) Freeze: revert if not paused
10) Freeze: revert if not owner
11) Freeze: emit event
*/

contract("Pausable", accounts => {
	const [account0, account1, account2, account3] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

    it("should let owner pause contract", async () => {
		await _instance.pause({from: account0});
		let isPaused = await _instance.isPaused.call();
		assert.strictEqual(isPaused, true, "Contract has not been paused.");
	});

	it("should REVERT when not-owner tries to pause contract", async () => {
		await truffleAssert.reverts(_instance.pause({from: account1}), truffleAssert.ErrorType.REVERT);
	});

	it("should emit event with correct parameters when the contract is paused", async () => {
		let result = await _instance.pause({from: account0});
		await truffleAssert.eventEmitted(result, 'ContractPaused', (ev) => {
		    return ev.pausedBy == account0;
		});
	});

	it("should let owner resume a paused contract", async () => {
		await _instance.pause({from: account0});
		await _instance.resume({from: account0});
		let isPaused = await _instance.isPaused.call();
		assert.strictEqual(isPaused, false, "Contract has not been resumed.");
	});

	it("should REVERT when owner tries to resume the contract if not paused", async () => {
		await truffleAssert.reverts(_instance.resume({from: account0}), truffleAssert.ErrorType.REVERT);
	});

	it("should REVERT when not-owner tries to resume a paused contract", async () => {
		await _instance.pause({from: account0});
		await truffleAssert.reverts(_instance.resume({from: account1}), truffleAssert.ErrorType.REVERT);
	});

	it("should emit event with correct parameters when the contract is resumed", async () => {
		await _instance.pause({from: account0});
		let result = await _instance.resume({from: account0});
		await truffleAssert.eventEmitted(result, 'ContractResumed', (ev) => {
		    return ev.resumedBy == account0;
		});
	});

	it("should let owner freeze contract if paused", async () => {
		await _instance.pause({from: account0});
		await _instance.freeze({from: account0});
		let isFrozen = await _instance.isFrozen.call();
		assert.strictEqual(isFrozen, true, "Contract has not been frozen.");
	});

	it("should REVERT freezeContract if contract is not paused", async () => {
		await truffleAssert.reverts(_instance.freeze({from: account0}), truffleAssert.ErrorType.REVERT);
	});

	it("should REVERT freezeContract if paused && msg.sender is not the owner", async () => {
		await _instance.pause({from: account0});
		await truffleAssert.reverts(_instance.freeze({from: account1}), truffleAssert.ErrorType.REVERT);
	});

	it("should emit event with correct parameters when frozen", async () => {	
		await _instance.pause({from: account0});
		let result = await _instance.freeze({from: account0});
		await truffleAssert.eventEmitted(result, 'ContractFrozen', (ev) => {
		    return ev.frozenBy == account0;
		});
	});
});