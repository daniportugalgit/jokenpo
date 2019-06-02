pragma solidity 0.5.0;

contract Ownable {
	address private owner;

	event OwnershipTransferred(address from, address to);

	constructor() public {
		owner = msg.sender;
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "You are not the owner!");
		_;
	}

	function transferOwnership(address payable newOwner) onlyOwner public {
		require (newOwner != address(0), "Please verify the new address.");
		require (newOwner != owner, "The new owner cannot be the same as the old owner.");

		owner = newOwner;

		emit OwnershipTransferred(msg.sender, newOwner); //it's cheaper to use newOwner (parameter) than owner (storage)
	}

	function getOwner() public view returns(address) {
		return owner;
	}
}