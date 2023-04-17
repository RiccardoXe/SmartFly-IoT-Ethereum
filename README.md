# SmartFly-EthereumIoTVerification

## Introduction

<p>To verify a cryptocurrency transaction, a node must also download and verify the validity of the
entire blockchain. Bitcoin and Ethereum offers a fast synchronization mechanism known as
Simplified Payment Verification (SPV) that is able to verify the validity of the blockchain by
downloading only the block header of each block in the chain. The SPV solution is not suitable
for IoT devices since it requires to download more than 4GB of block headers and the IoT
devices have usually strong memory constraints.
In August 2020 the paper <b>"FlyClient: Super-Light Clients for Cryptocurrencies"</b> introduced a
theoretical super light verification protocol that decrease by a factor of 6000 the memory
required to verify the blockchain compared to the SPV solution. The FlyClient verification
protocol uses Merkle Mountain Range (MMR) commitments and requires that the MMR root
must be stored in a new field in the Ethereum Block Header.
The introduction of a new field in the Ethereum Blockchain imposes a chain fork and
consequently the upgrade of the software present in every node. </p>
<p><b>SmartFly develops a real
architecture including a Smart Contract deployed on the Ethereum Blockchain to implement
the FlyClient concept without the need of a fork</b>. SmartFly also shows how an MMR construct
where multiple blocks are used to create a single MMR leaf can be beneficial in term of Smart
Contract costs contention and can also decrease the proof size.</p>

## SmartFly - Architecture

The SmartFly has three key elements:

<ol>
<li><b>Smart Contract</b></li>
<li><b>Prover</b></li>
<li><b>Verifier</b></li>
</ol>

### SmartFly - Smart Contract
The Smart Contact is the only in chain element of the SmartFly architecture. 

The Smart Contract:
<ul>
<li>Takes as input a sequence of blocks from any address.</li>
<li>Checks the correctness of the information given as input comparing them to the blockhashes it is able to see.</li>
<li>Extracts the difficulty information from the given blocks.</li>
<li>Build the new Difficulty MMR and store its peaks the SC storage area and its root in the block receipts trie of the current block.</li>
</ul>
The SmartFly - Smart Contract has been written in order to minimize the gas cost needed to perform all the above steps by optimizing the code, reducing the utilized storage area, aggregating multiple blocks in a single MMR Leaf.

### SmartFly - Provers

The provers are Ethereum Full Nodes, that are willing to provide the proving service. 
The SmartFly - Provers:
<ul>
  <li>Store the Full Difficulty MMR.</li>
  <li>Synchronize the local Difficulty MMR with the one in chain using the blockchain data.</li>
  <li>Declare the current Difficulty MMR Root.</li>
  <li>Provide MMR Membership proofs (list of blocks and Difficulty MMR leaves) given a block number, block relative difficulty or a transaction hash.</li>
</ul>

The Verifier protocol performs all the checks needed to verify if it is communicating with a malicious prover or not.

### SmartFly - Verifier 

A verifier is any device, constrained or not, that wants to verify the presence of a transaction in the Ethereum Blockchain.

The verifier:
<ul>
  <li>Asks to a SmartFly Prover the Difficulty MMR root Proof.</li>
  <li>Asks to a SmartFly Prover the Difficulty MMR proof of a block, a block in a specific relative difficulty or a transaction hash .</li>
  <li>Performs a sampling protocol in order to validate the Blockchain validity. </li>
  <li>Validates the Difficulty MMR Proofs (hashes and difficulty transitions).</li>
</ul>

If the verifier checks fails, the verifier starts communicating with another SmartFly Prover.

## How to Run a SmartFly

### SmartFly - Smart Contract 
Launch a private ganache instance:
```
ganache-cli  -a 100 -e 10000 -m "DifficultyMMR? Why not?" -p 7200 -l 30000000 -i 7200
```

Compile and deploy contracts (execute command in this directory)
```
truffle migrate --reset
```

### SmartFly - Prover

Run the following command:

```
  node ./js/Prover Module/restServer.js
```

This command will synchronize the local Prover Difficulty MMR with the Blockchain's one.

A REST API service is initialized in order to activate the proving service. 

Use the proverIP address and the following paths to communicate with it (By default port 8081):

### SmartFly - Verifier

Configure the verifier by inserting the list of known SmartFly prover in:

```
./js/VerifierModule/config_verifier.js
```

By running 
```
node ./js/VerifierModule/verifierClassFinal.js
```
The sampling protocol is started, and the chain verification result is printed.

## Author and Relators

<p> <b>Author:</b> Riccardo Xefraj</p>
<p> <b>Relators:</b> Prof.Dini Gianluca, Prof.Perazzo Pericle, Dott.Basile Mariano.</p>
