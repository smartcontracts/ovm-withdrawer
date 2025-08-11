import { ethers } from 'ethers'
import { program } from 'commander'
import { CrossChainMessenger, MessageDirection } from '@eth-optimism/sdk'

program
  .name('ovmwd')
  .description('execute OVM1 withdrawals')
  .version('0.0.1')

program
  .command('exec')
  .description('execute OVM1 withdrawals')
  .requiredOption('--l1-token <token>', 'l1 token address or "eth"')
  .requiredOption('--l2-token <token>', 'l2 token address or "eth"')
  .requiredOption('--amount <amount>', 'amount to withdraw')
  .requiredOption('--from <from>', 'from address')
  .requiredOption('--to <to>', 'to address')
  .requiredOption('--nonce <nonce>', 'message nonce')
  .requiredOption('--pk <key>', 'private key to prove or relay with')
  .requiredOption('--l1-rpc <url>', 'l1 rpc url')
  .requiredOption('--l2-rpc <url>', 'l2 rpc url')
  .action(async (args) => {
    const l1Provider = new ethers.providers.InfuraProvider(args.l1Rpc)
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(args.l2Rpc)
    const l1Wallet = new ethers.Wallet(args.pk, l1Provider)
    const xdm = new CrossChainMessenger({
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Provider,
      l1ChainId: 1,
      l2ChainId: 10,
      bedrock: true,
    })

    let data
    if (
      (args.l1Token === 'eth' || args.l1Token === '0x0000000000000000000000000000000000000000') &&
      (args.l2Token === 'eth' || args.l2Token === '0x4200000000000000000000000000000000000006')
    ) {
      data = xdm.contracts.l1.L1StandardBridge.interface.encodeFunctionData(
        'finalizeETHWithdrawal',
        [
          args.from,
          args.to,
          args.amount,
          '0x'
        ]
      )
    } else {
      data = xdm.contracts.l1.L1StandardBridge.interface.encodeFunctionData(
        'finalizeERC20Withdrawal',
        [
          args.l1Token,
          args.l2Token,
          args.from,
          args.to,
          args.amount,
          '0x'
        ]
      )
    }

    const message = {
      direction: MessageDirection.L2_TO_L1,
      logIndex: 0,
      blockNumber: 0,
      transactionHash: ethers.constants.HashZero,
      sender: xdm.contracts.l2.L2StandardBridge.address,
      target: xdm.contracts.l1.L1StandardBridge.address,
      messageNonce: ethers.BigNumber.from(args.nonce),
      value: ethers.BigNumber.from(0),
      minGasLimit: ethers.BigNumber.from(0),
      message: data
    }

    console.log('proving withdrawal')
    const receipt = await xdm.proveMessage(message)
    console.log('transaction:', receipt.transactionHash)
    await receipt.wait()
    console.log('withdrawal proven')
  })

program.parse(process.argv)
