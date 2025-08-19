import { ethers } from 'ethers'
import { program } from 'commander'
import { CrossChainMessenger, MessageDirection } from '@eth-optimism/sdk'
import fs from 'fs'

program
  .name('ovmwd')
  .description('execute OVM1 withdrawals')
  .version('0.0.1')

program
  .command('exec')
  .description('execute OVM1 withdrawals')
  .requiredOption('--hash <hash>', 'withdrawal transaction hash')
  .requiredOption('--pk <key>', 'private key to prove or relay with')
  .requiredOption('--l1-rpc <url>', 'l1 rpc url')
  .requiredOption('--l2-rpc <url>', 'l2 rpc url')
  .action(async (args) => {
    // Load withdrawal data from JSON
    const withdrawalsRaw = fs.readFileSync('./data/withdrawals_parsed.json', 'utf8')
    const withdrawals = JSON.parse(withdrawalsRaw)
    
    // Look up withdrawal by hash
    const withdrawal = withdrawals[args.hash]
    if (!withdrawal) {
      console.error(`Withdrawal with hash ${args.hash} not found`)
      process.exit(1)
    }
    
    console.log('Found withdrawal:', withdrawal)
    
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(args.l1Rpc)
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(args.l2Rpc)
    const l1Wallet = new ethers.Wallet(args.pk, l1Provider)
    const xdm = new CrossChainMessenger({
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Provider,
      l1ChainId: 1,
      l2ChainId: 10,
      bedrock: true,
    })

    let message
    
    // Handle ERC20/ETH transfers
    if (withdrawal.l1Token !== undefined && withdrawal.l2Token !== undefined) {
      let data
      if (
        (withdrawal.l1Token === '0x0000000000000000000000000000000000000000') &&
        (withdrawal.l2Token === '0x4200000000000000000000000000000000000006')
      ) {
        // ETH withdrawal
        data = xdm.contracts.l1.L1StandardBridge.interface.encodeFunctionData(
          'finalizeETHWithdrawal',
          [
            withdrawal.from,
            withdrawal.to,
            withdrawal.amount,
            withdrawal.extraData || '0x'
          ]
        )
      } else {
        // ERC20 withdrawal
        data = xdm.contracts.l1.L1StandardBridge.interface.encodeFunctionData(
          'finalizeERC20Withdrawal',
          [
            withdrawal.l1Token,
            withdrawal.l2Token,
            withdrawal.from,
            withdrawal.to,
            withdrawal.amount,
            withdrawal.extraData || '0x'
          ]
        )
      }

      message = {
        direction: MessageDirection.L2_TO_L1,
        logIndex: 0,
        blockNumber: 0,
        transactionHash: ethers.constants.HashZero,
        sender: xdm.contracts.l2.L2StandardBridge.address,
        target: xdm.contracts.l1.L1StandardBridge.address,
        messageNonce: ethers.BigNumber.from(withdrawal.messageNonce),
        value: ethers.BigNumber.from(0),
        minGasLimit: ethers.BigNumber.from(0),
        message: data
      }
    } else {
      // Handle other message types using target/sender/message/messageNonce
      message = {
        direction: MessageDirection.L2_TO_L1,
        logIndex: 0,
        blockNumber: 0,
        transactionHash: ethers.constants.HashZero,
        sender: withdrawal.sender,
        target: withdrawal.target,
        messageNonce: ethers.BigNumber.from(withdrawal.messageNonce),
        value: ethers.BigNumber.from(0),
        minGasLimit: ethers.BigNumber.from(0),
        message: withdrawal.message
      }
    }

    console.log('proving withdrawal')
    const receipt = await xdm.proveMessage(message)
    console.log('transaction:', receipt.transactionHash)
    await receipt.wait()
    console.log('withdrawal proven')
  })

program.parse(process.argv)
