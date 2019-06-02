const truffleAssert = require('truffle-assertions');
const BASE_CONTRACT = artifacts.require("JoKenPo");

/*
1) Transfer Ownership
2) Transfer Ownership: emit event
3) Transfer Ownership: revert if newOwner == 0x0
4) Transfer Ownership: revert if newOwner == oldOwner
5) Transfer Ownership: revert if not owner
*/

contract("Ownable", accounts => {
	const [account0, account1, account2] = accounts;
	let _instance;

	beforeEach('setup contract for each test', async function () {
        _instance = await BASE_CONTRACT.new({from:account0});
    })

    it("should allow owner to change ownership to valid address", async () => {
		await _instance.transferOwnership(account1, {from: account0})
		let newOwner = await _instance.getOwner.call();
		assert.strictEqual(newOwner, account1, "Ownership has not changed.");
	});

	it("should emit event with correct parameters when the ownership is transeferred", async () => {		
		let result = await _instance.transferOwnership(account1, {from: account0});
		await truffleAssert.eventEmitted(result, 'OwnershipTransferred', (ev) => {
		    return ev.from == account0 && ev.to == account1;
		});
	});

	it("should REVERT TransferOwnership if new owner is addres(0)", async () => {
		await truffleAssert.reverts(_instance.transferOwnership("0x0000000000000000000000000000000000000000", {from: account0}), truffleAssert.ErrorType.REVERT);
	});

	it("should REVERT TransferOwnership if new owner is the same as old owner", async () => {
		await truffleAssert.reverts(_instance.transferOwnership(account0, {from: account0}), truffleAssert.ErrorType.REVERT);
	});

	it("should REVERT TransferOwnership if msg.sender is not the owner", async () => {
		await truffleAssert.reverts(_instance.transferOwnership(account1, {from: account2}), truffleAssert.ErrorType.REVERT);
	});
});

