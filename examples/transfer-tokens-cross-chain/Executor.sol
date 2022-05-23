//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IAxelarGasReceiver} from "@axelar-network/axelar-cgp-solidity/src/interfaces/IAxelarGasReceiver.sol";
import {IAxelarExecutable} from "@axelar-network/axelar-cgp-solidity/src/interfaces/IAxelarExecutable.sol";
import { IERC20 } from '@axelar-network/axelar-cgp-solidity/src/interfaces/IERC20.sol';
import "hardhat/console.sol";

contract Executor is IAxelarExecutable {
    // Axerlar Network only approves messages
    // We pay estimated gas costs upront on source chain
    // to use Axelars relay service Axelar Gas Receiver to execute the approved message
    IAxelarGasReceiver gasReceiver;

    constructor(address _gateway, address _gasReceiver) IAxelarExecutable(_gateway) {
        gasReceiver = IAxelarGasReceiver(_gasReceiver);
    }

    function transferTokenCrossChain(
        string memory destinationChain,
        string memory contractAddress,
        string memory recipientAddress,
        string memory symbol,
        uint256 amount
    ) external payable {
        // approve and send token from user to this contract
        address tokenAddress = gateway.tokenAddresses(symbol);
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        IERC20(tokenAddress).approve(address(gateway), amount);

        // encode recipient address in payload to be passed to contract on destination chain
        bytes memory payload = abi.encode(recipientAddress);

        console.log('tokenAddress: ', tokenAddress);
        console.log('contractAddress destination chain: ', contractAddress);
        console.log('recipientAddress: ', recipientAddress);
        console.log('amount:', amount);
        console.log('msg.value:', msg.value);

        if(msg.value > 0){
            // pay Gas Receiver upfront with native token for execution
            gasReceiver.payNativeGasForContractCallWithToken{value: msg.value}(
                address(this), // sender
                destinationChain,
                contractAddress, // address of AxelarExecutable Contract on destination chain
                payload, // contains the address of final recipient
                symbol, // 
                amount,
                msg.sender
            );
        }
        // call callContractWithToken function of the user's source chain gateway contract
        // the gateway will then call _executeWithToken function on the destination chain
        gateway.callContractWithToken(destinationChain, contractAddress, payload, symbol, amount);

    }

    function _executeWithToken(
        string memory, 
        string memory,
        bytes memory payload, 
        string memory symbol, 
        uint256 amount
        ) internal override {
            // decode recipient
            address recipient = abi.decode(payload, (address));
            console.log("recipientAddress(decoded):", recipient);
            
            // get ERC-20 address from gateway
            address tokenAddress = gateway.tokenAddresses(symbol);
            IERC20(tokenAddress).transfer(recipient, amount);
        }   
}