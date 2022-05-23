'use strict';

const { getDefaultProvider, Contract, constants: { AddressZero } } = require('ethers');
const { utils: { deployContract }} = require('@axelar-network/axelar-local-dev');

const TransferCrossChainExecutable = require('../../build/Executor.json');
const Gateway = require('../../build/IAxelarGateway.json');
const IERC20 = require('../../build/IERC20.json');

async function deploy(chain, wallet){
    console.log(`Deploying TransferCrossChainExecutable for ${chain.name}`);
    const contract = await deployContract(wallet, TransferCrossChainExecutable, [chain.gateway, chain.gasReceiver]);
    chain.transferCrossChainExecutable = contract.address;
    console.log(`Deployed TransferCrossChainExecutable for ${chain.name} at ${chain.transferCrossChainExecutable}.`);
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
        chain.contract = new Contract(chain.transferCrossChainExecutable, TransferCrossChainExecutable.abi, chain.wallet);
        chain.gateway = new Contract(chain.gateway, Gateway.abi, chain.wallet);
        const ustAddress = chain.gateway.tokenAddresses('UST');
        chain.ust = new Contract(ustAddress, IERC20.abi, chain.wallet); // ToDo might need to change it to usdc
    }
    
    async function print() {
        for(const account of accounts) {
            console.log(`${account} has ${await destination.ust.balanceOf(account)/1e6} UST`)
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
    const gasPrice = await getGasPrice(source, destination, AddressZero);
    
    const balance = BigInt(await destination.ust.balanceOf(accounts[0]));
    await (await source.ust.approve(
        source.contract.address,
        amount,
    )).wait();
    await (await source.contract.transferTokenCrossChain(
        destination.name,
        destination.transferCrossChainExecutable,
        accounts[0], 
        'UST',
        amount,
        {value: BigInt(Math.floor(gasLimit * gasPrice))}
    )).wait();
    while(BigInt(await destination.ust.balanceOf(accounts[0])) == balance) {
        await sleep(2000);
    }

    console.log('--- After ---');
    await print();
}

module.exports = {
    deploy,
    test,
}