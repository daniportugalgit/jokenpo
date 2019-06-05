//A little helper to avoid calculating gas costs whenever you want to verify a withdrawal
//It executes a function in the contract and afterwards checks if there's a balance difference
//in the same account that called the function;
//It effectively removes gas costs from the equation.
async function balanceDiff(solFunction, account, expectedDiff, errorMsg) {
	let balanceBefore = await web3.eth.getBalance(account);
	let tx = await solFunction;

	//The "old" way (good for local tests, but bad for injected web3):
	//let receipt = tx.receipt;
	//let gasPrice = await web3.eth.getGasPrice();
	//let txFee = gasPrice * receipt.gasUsed;

	let postTx = await web3.eth.getTransaction(tx.receipt.transactionHash); //we can get the 100% correct gasPrice from this guy (but not the gasUsed)
	let txFee = web3.utils.toBN(postTx.gasPrice * tx.receipt.gasUsed);

	let expected = web3.utils.toBN(balanceBefore).add(web3.utils.toBN(expectedDiff)).sub(web3.utils.toBN(txFee));
	let balanceAfter = await web3.eth.getBalance(account);
	assert.strictEqual(balanceAfter.toString(10), expected.toString(10), errorMsg);
};

module.exports = {
  balanceDiff
};
    
