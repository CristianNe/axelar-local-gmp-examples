'use strict';

const { getDefaultProvider, Contract, constants: { AddressZero } } = require('ethers');
const { utils: { deployContract }} = require('@axelar-network/axelar-local-dev');

const Executor = require('../../build/Executor.json');
const Gateway = require('../../build/IAxelarGateway.json');
const IERC20 = require('../../build/IERC20.json');

async function deploy(chain, wallet){
    console.log(`Deploying TransferCrossChainExecutable for ${chain.name}`);
    const contract = await deployContract(wallet, Executor, [chain.gateway, chain.gasReceiver]);
    chain.executor = contract.address;
    console.log(`Deployed TransferCrossChainExecutable for ${chain.name} at ${chain.executor}.`);
}

async function test(chains, wallet, options) {
    const args = options.args || [];
    const getGasPrice = options.getGasPrice;
    const source = chains.find(chain => chain.name == (args[0] || 'Avalanche'));
    const destination = chains.find(chain =>chain.name == (args[1] || 'Fantom'));
    const amount = Math.floor(parseFloat(args[2]))*1e6 || 10e6;
    const accounts = args.slice(3);
    if(accounts.length == 0)
        accounts.push(wallet.address);
    for(const chain of [source, destination]) {
        const provider = getDefaultProvider(chain.rpc);
        chain.wallet = wallet.connect(provider);
        chain.contract = new Contract(chain.executor, Executor.abi, chain.wallet);
        chain.gateway = new Contract(chain.gateway, Gateway.abi, chain.wallet);
        const usdcAddress = chain.gateway.tokenAddresses('aUSDC');
        chain.usdc = new Contract(usdcAddress, IERC20.abi, chain.wallet);
    }
    
    async function print() {
        for(const account of accounts) {
            console.log(`${source.name}: ${account} has ${await source.usdc.balanceOf(account)/1e6} aUSDC`)
            console.log(`${destination.name}: ${account} has ${await destination.usdc.balanceOf(account)/1e6} aUSDC`)
        }
    }
    function sleep(ms) {
        return new Promise((resolve)=> {
            setTimeout(() => {resolve()}, ms);
        })
    }

    console.log('--- Initially ---');
    await print();

    const gasLimit = 3e6;
    console.log('Get Gas Price...');
    const gasPrice = await getGasPrice(source, destination, AddressZero);
    console.log('Gas Price:', gasPrice);
    
    console.log('Get Balance of %s...', accounts[0]);
    const balance = BigInt(await destination.usdc.balanceOf(accounts[0]));
    console.log('Balance: ', balance);

    console.log('Approve Executor contract on source chain to spent amount...');
    await (await source.usdc.approve(
        source.contract.address,
        amount,
    )).wait();

    console.log('Call tranferTokenCrossChain function of Executor contract');
    console.log('destination chain: ', destination.name);
    console.log('destination chain contract address: ', destination.executor);
    console.log('recipient address: ', accounts[0]);
    console.log('amount: ', amount);
    
    await (await source.contract.transferTokenCrossChain(
        destination.name,
        destination.executor,
        accounts[0], 
        'aUSDC',
        amount,
        {value: BigInt(Math.floor(gasLimit * gasPrice))}
    )).wait();
    
    console.log('Call finished...');
    
    while(BigInt(await destination.usdc.balanceOf(accounts[0])) == balance) {
        await sleep(5000);
    }

    console.log('--- After ---');
    await print();
}

module.exports = {
    deploy,
    test,
}