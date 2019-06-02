pragma solidity 0.5.0;

import "./Ownable.sol";

contract Pausable is Ownable {
	bool private paused;
	bool private frozen;
	
	event ContractPaused(address indexed pausedBy);
	event ContractResumed(address indexed resumedBy);
	event ContractFrozen(address indexed frozenBy);
	
	modifier onlyPaused() {
		require(paused, "The contract must be paused to perform this action.");
		_;
	}

	modifier onlyReady() {
		require(!paused && !frozen, "The contract is paused or frozen. Please contact the administrator.");
		_;
	}

	modifier onlyNotFrozen() {
		require(!frozen, "The contract is already frozen. Please contact the administrator.");
		_;
	}

	function pause() public onlyOwner onlyReady {
		paused = true;
		emit ContractPaused(msg.sender);
	}

	function resume() public onlyOwner onlyPaused onlyNotFrozen {
		paused = false;
		emit ContractResumed(msg.sender);
	}

	//CANNOT BE UNDONE:
	function freeze() public onlyOwner onlyPaused onlyNotFrozen {
		frozen = true;
		emit ContractFrozen(msg.sender);
	}

	function isPaused() public view returns(bool) {
		return paused;
	}

	function isFrozen() public view returns(bool) {
		return frozen;
	}
}