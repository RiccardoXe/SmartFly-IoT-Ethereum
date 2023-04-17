// ************ INITIALIZATION AND REQUIREMENTS ***************
const Web3 = require('web3');

//import merkle-patricia-tree
const Tree = require('merkle-patricia-tree').BaseTrie

// FOR LEGACY MERKLE-PATRICIA-TREE
//Rpc import
const Rpc  = require('isomorphic-rpc')
//For ethereum structure
const { Receipt } = require('eth-object')
// Recursive Length Prefix - for data encoding and encoding
const rlp = require('rlp')
// Ethereum Encoder
const { encode } = require('eth-util-lite')
//////

// For File System management
const fs = require('fs');

const abiDecoder = require('abi-decoder');
// ************************************************************** 

// *********** Initialization data from .json file **************

//Configuration file
var JSONConfiguration = JSON.parse(fs.readFileSync("./configuration_smartcontract_invocation.json"));

//Since every prover is a full node the provider 
const provider  = JSONConfiguration['provider'];
//Block to wait to consider a transaction accepted in the blockchain
const confirmationBlocks = JSONConfiguration['confirmationBlocks'];

const web3 = new Web3(JSONConfiguration['provider']);
//Gas limit for each block
const gasLimitAppend = JSONConfiguration['gasLimit'];
//Set BlockManger in untrusted mode or partially-trusted mode
const scenario = JSONConfiguration['scenario'];
//Initialize where .json of smart contract can be found - smart contract structure
var SmartFliesJson;
if(scenario == "untrusted"){
    SmartFliesJson = require(JSONConfiguration['smartfliesUntrustedJsonPath']);
} else {
    SmartFliesJson = require(JSONConfiguration['smartfliesPartiallyTrustedJsonPath']);
}

// *************************************************************

class BlockManager{

    constructor(id, address){
        //get all the network information
        this.id = id;
        this.deployedNetwork = SmartFliesJson.networks[id];
        this.address = address;
        // The last block contain a SC update is unknown at start time
        this.lastBlockNumber = 0;

        //get the information to interact with the SC
        this.MMRContract = new web3.eth.Contract(
            SmartFliesJson.abi,
            this.deployedNetwork.address
        );
        //to format back tx data from data extracted from the chain
        abiDecoder.addABI(SmartFliesJson.abi);
        this.rpc = new Rpc(provider);
    }

    /**
     * To be used for testing purposes 
     * (actually for data analysis a better solution has been used)
     * @param {*} hostPort port providing the service
     * @param {*} fileName where to store statistics about gas cost
     */
    async init(hostPort, fileName){
        this.id = hostPort;
        this.deployedNetwork = SmartFliesJson.networks[this.id];
        this.addresses = await  web3.eth.getAccounts();
        this.lastBlockNumber = 0;
        this.fileName = 'GasCost' + fileName + '.txt';

        this.MMRContract = await new web3.eth.Contract(
            SmartFliesJson.abi,
            this.deployedNetwork.address
        );

    }

    /* ****************************** SMARTFLIES INVOCATION ****************************** */

    /**
     * This method collects the blocks seen by the local node blockchain 
     * and than updates the SC by giving the unseen blocks as input
     * @param {*} numberOfBlocks - Number of blocks to give in input to the SC a brief discussion is 
     * present in the documentation
     * @param {*} offsetOfBlock If the SC is empty from which block to start the MMR creation
     * @returns Transaction containing the update
     */
     async updateSmartContract(numberOfBlocks, offsetOfBlock = 1){
        try{
            var resetSC = false;
            //to simplify code the last block seen by the SC is directly requested to the SC itself 
            this.lastBlockNumber = parseInt(await this.getLastBlockIndex());
            console.log("   LastBlock seen by SC:" + this.lastBlockNumber);
            //so the last blockNumber is unknown -> must be set to the latest seen block number by the SC    
            if(this.lastBlockNumber == 0){
                console.log("   EMPTY SC - blockIndex will be retrieved from the chain")
                this.lastBlockNumber = await web3.eth.getBlockNumber() - offsetOfBlock;
                resetSC = true;
                // Reset current stored files or DBs 
            
            }
            console.log("   FIRST BLOCK NUMBER INPUT TO SC: " +  this.lastBlockNumber);
            //The next block that the SC must see
            var blocksArray = await this.getBlocksData(this.lastBlockNumber + 1, numberOfBlocks);
            //RLP encode the obtained blocks from the Ethereum chain
            //var dataToHash = blocksArray;
            var dataToHash = rlp.encode(blocksArray);
            //process.stdout.write(dataToHash);

            //let decodedText =  new TextDecoder().decode(dataToHash)
            //var uint8array = new TextEncoder("utf-8").encode(decodedText);
            const addresses = await web3.eth.getAccounts();

            //send to the smart contract 
            //store arguments STARTING INDEX, ENDING INDEX, BLOCKS RLP ENCODED
            //TODO: Modify from: addresses[0] - possible to specify payer address
            //console.log(newArray)
            // RX: De-comment to see data send to SC
            //console.log(dataToHash.toString("hex"))
            let transactionResponse = await this.MMRContract.methods
                .store(dataToHash)
                   //[249,1,252,249,1,249,160,99,24,198,176,33,86,152,33,129,242,212,8,186,228,41,189,225,189,99,127,65,114,127,181,67,189,128,232,90,123,165,153,160,29,204,77,232,222,199,93,122,171,133,181,103,182,204,212,26,211,18,69,27,148,138,116,19,240,161,66,253,64,212,147,71,148,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,160,186,101,178,137,254,82,6,212,160,87,225,252,57,91,144,49,214,92,229,222,189,233,57,160,160,213,35,2,103,181,34,210,160,18,155,95,177,117,233,223,73,137,188,238,157,150,180,197,195,3,3,133,236,65,86,137,152,216,39,40,240,234,145,82,167,160,204,8,72,3,213,26,104,225,161,178,40,131,130,147,241,36,181,70,45,93,59,14,76,217,73,252,142,4,221,164,224,24,185,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,130,49,109,132,1,201,195,128,130,92,12,132,97,137,178,55,128,160,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,136,0,0,0,0,0,0,0])
                .send({from: addresses[0],
                    gasLimit: gasLimitAppend}, function (err, res) {
                            if (err) {
                                console.log("   [APPEND ERROR] An error occurred", err)
                                throw err;
                            }
                                console.log("   [APPEND SUCCESSFUL] Hash of the transaction: " + res)
                            })
            return {transactionResponse: transactionResponse, resetSC: resetSC}
        } catch(e){
            throw e;
        }
    }



    /**
     * This method collects the blocks seen by the local node blockchain 
     * and than updates the SC by giving the unseen blocks as input
     * @param {*} numberOfBlocks - Number of blocks to give in input to the SC a brief discussion is 
     * present in the documentation
     * @param {*} offsetOfBlock If the SC is empty from which block to start the MMR creation
     * @returns Transaction containing the update
     */
     async updateSmartContractUntrusted(RLPEncodedBlocks, idxFirstBlockCovered){
        try{
            this.lastBlockNumber = idxFirstBlockCovered;

            const addresses = await web3.eth.getAccounts();

            //send to the smart contract 
            //store arguments STARTING INDEX, ENDING INDEX, BLOCKS RLP ENCODED
            //TODO: Modify from: addresses[0] - possible to specify payer address
            // RX: De-comment to see data send to SC
            //console.log(dataToHash.toString("hex"))
            let transactionResponse = await this.MMRContract.methods
                .store(RLPEncodedBlocks)
                .send({from: addresses[0],
                    gasLimit: gasLimitAppend}, function (err, res) {
                            if (err) {
                                console.log("   [APPEND ERROR] An error occurred", err)
                                throw err;
                            }
                                console.log("   [APPEND SUCCESSFUL] Hash of the transaction: " + res)
                            })
            return transactionResponse
        } catch(e){
            throw e;
        }
    }

    /**
     * Send data to update SmartFlies contact in untrusted scenario
     * @param {*} MMRLeaf - Difficulty MMR leaf to append to the SC 
     *  format {peak:"",timestampFirstBlockCoverd:"",timestampLastBlockCoverd:"",difficultyFirstBlockCoverd:"",
     *  difficultyLastBlockCoverd:"", NodeDifficulty:"", numberOfBlocks:""}
     * @param {*} idxFirstBlockCovered - Index of first block covered by the MMRLeaf
     * @returns transaction result (information)
     */
    async updateSmartContractPartiallyTrusted(MMRLeaf, idxFirstBlockCovered){
        try{
            this.lastBlockNumber = idxFirstBlockCovered;
            const addresses = await web3.eth.getAccounts();
            let transactionResponse = await this.MMRContract.methods
                .store(MMRLeaf.toTuple(), idxFirstBlockCovered)
                .send({from: addresses[0],
                    gasLimit: gasLimitAppend}, function (err, res) {
                            if (err) {
                                console.log("   [APPEND ERROR] An error occurred", err)
                                throw err;
                            }
                                console.log("   [APPEND SUCCESSFUL] Hash of the transaction: " + res)
                            })
            return transactionResponse;
        } catch(e){
            throw e;
        }
    }

    /**
     * This method collects the blocks seen by the local node blockchain 
     * and than updates the SC by giving the unseen blocks as input
     * @param {*} numberOfBlocks - Number of blocks to give in input to the SC a brief discussion is 
     * present in the documentation
     * @param {*} offsetOfBlock If the SC is empty from which block to start the MMR creation
     * @returns Transaction containing the update
     */
    async updateSmartContractSemiTrusted(firstBlock, lastBlock, nodeDifficulty){
        try{
            this.lastBlockNumber = idxFirstBlockCovered;
            //process.stdout.write(RLPEncodedBlocks);

            //let decodedText =  new TextDecoder().decode(RLPEncodedBlocks)
            //var uint8array = new TextEncoder("utf-8").encode(RLPEncodedBlocks);
            const addresses = await web3.eth.getAccounts();
    
            //send to the smart contract 
            //store arguments STARTING INDEX, ENDING INDEX, BLOCKS RLP ENCODED
            //TODO: Modify from: addresses[0] - possible to specify payer address
            //console.log(newArray)
            // RX: De-comment to see data send to SC
            //console.log(dataToHash.toString("hex"))
            let transactionResponse = await this.MMRContract.methods
                .store(firstBlock, lastBlock, nodeDifficulty)
                .send({from: addresses[0],
                    gasLimit: gasLimitAppend}, function (err, res) {
                            if (err) {
                                console.log("   [APPEND ERROR] An error occurred", err)
                                throw err;
                            }
                                console.log("   [APPEND SUCCESSFUL] Hash of the transaction: " + res)
                            })
            return transactionResponse
        } catch(e){
            throw e;
        }
        }

    ////////////////  TESTING UTILITIES - DELETE //////////////////
    binToInt(bin){
        return parseInt(bin, 2);
    }

    decimalToHexString(number)
    {
        if (number < 0)
        {
            number = 0xFFFFFFFF + number + 1;
        }

        return "0x" + number.toString(16);
    }

     toHexString(byteArray) {
        return Array.from(byteArray, function(byte) {
          return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }).join('')
      }
    /////////////////////////////////////////////////////////////

    /**
     * Send a default transaction - For testing purposes
     * This function allows to populate the chain with transactions
     * in the current Ganche setting every transaction received will generate a block in the chain
     */
    async sendDefaultTransaction(){
        const addresses = await  web3.eth.getAccounts();
        await web3.eth.sendTransaction({
            from: addresses[1],
            to: addresses[2],
            value:'1000'
        })
    }

    /**
     * Deploy the SmartContract again 
     */
    //async deploySmartContract(){
    //    const addresses = await this.web3.eth.getAccounts();
    //    this.MMRContract = await new web3.eth.Contract(MMRLightLogJson.abi)
    //        .deploy({data: "0x" + evm.bytecode.object, arguments: []})
    //        .send({from: accounts[0], gas: 5000000})
    //}

    /* *************************** END SMARTFLIES INVOCATION ****************************** */
    
    /* ***************************  GET BLOCKS INFORMATION ********************************* */
    
    /**
     * Invocate MMR Smart Contract to know the last seen block
     */
    async getLastBlockIndex(){
        return await this.MMRContract.methods.getLastBlockNumber().call();
    }


    /**
     * Get array of blocks from the Blockchain 
     * @param {*} startingBlockIdx Index of first block to get
     * @param {*} numberOfBlocks Number of blocks to get starting from startingBlockIndex
     * @returns Array with blocks from this.getLastBlockNumber to this.getLastBlockNumber + 1 + numberOfBlocks
     */
    async getBlocksData(startingBlockIdx, numberOfBlocks){
        var blocksArray = [];
        var updatedLastBlockNumber = startingBlockIdx + numberOfBlocks;
        for(var i= startingBlockIdx ; i< updatedLastBlockNumber ; i++){
            blocksArray.push( await this.getSingleBlock(i));
        }
        return blocksArray;
    } 


    /**
     * This function order and formats the block information needed to recalculate 
     * its hash following the Ethash algorithm
     * @param {*} blockIndex - Index of block to retrieve from the blockchain
     * @returns Blocks information in array format 
     */
    async getSingleBlock(blockIndex){
        //access the blockchain block 
        var Block2 = await web3.eth.getBlock(blockIndex);
        if(Block2 == null){
            throw "[NON EXISTING BLOCK] Last block seen by SC " + this.lastBlockNumber +
             "| Blocks requested to append: " + blockIndex + " [Please decrease the number of blocks to append]"
        }
        //list of the needed parameters to calculate the Block hash again
        //Change all values '0x0' in '0x' to calculate 
        var Block2_formatted  = 
        [   
            (Block2.parentHash	 				 == '0x0' ? '0x' : Block2.parentHash	 				),
            (Block2.sha3Uncles  				 == '0x0' ? '0x' : Block2.sha3Uncles  					),
            (Block2.miner       				 == '0x0' ? '0x' : Block2.miner       					),
            (Block2.stateRoot   				 == '0x0' ? '0x' : Block2.stateRoot   					),
            (Block2.transactionsRoot 			 == '0x0' ? '0x' : Block2.transactionsRoot 				),
            (Block2.receiptsRoot     			 == '0x0' ? '0x' : Block2.receiptsRoot     				),
            (Block2.logsBloom        			 == '0x0' ? '0x' : Block2.logsBloom        				),
            (web3.utils.toHex(Block2.difficulty) == '0x0' ? '0x' : web3.utils.toHex(Block2.difficulty)	),
            (web3.utils.toHex(Block2.number)     == '0x0' ? '0x' : web3.utils.toHex(Block2.number)   	),
            (web3.utils.toHex(Block2.gasLimit)   == '0x0' ? '0x' : web3.utils.toHex(Block2.gasLimit) 	),
            (web3.utils.toHex(Block2.gasUsed)    == '0x0' ? '0x' : web3.utils.toHex(Block2.gasUsed)  	),
            (web3.utils.toHex(Block2.timestamp)  == '0x0' ? '0x' : web3.utils.toHex(Block2.timestamp)	),
            (Block2.extraData        			 == '0x0' ? '0x' : Block2.extraData        				),
            (Block2.mixHash          			 == '0x0' ? '0x' : Block2.mixHash          				),
            (Block2.nonce            			 == '0x0' ? '0x' : Block2.nonce            				),
        ]
        return Block2_formatted;
    }

    /**
     * RX: THIS FUNCTION IS NOT USED - In here for validation tests 
     * The root position has changed now is in data and no more in topics (this function is not used)
     * getRoot() is used to retrieve the MMR Root from the latest block
     * @returns MMR Root hash and difficulty taken from SC log
     */
    async getRootFromLog(){
        let rootEvent = await this.MMRContract.getPastEvents('EventLogRoot', {
            filter: {},
            fromBlock: 'latest', 
            toBlock: 'latest'
        })

       // console.log(rootEvent)
        if(rootEvent[0] == undefined)
            return [null, null]

       
        let rootInfo = rootEvent[0]['returnValues']
        //rootEvent.get((error, logs) => {
            // we have the logs, now print them
        //    logs.forEach(log => console.log(log.args)) } );

        /*var rootHash = await this.MMRContract.methods.getRootValue().call();
        var rootDiff = await this.MMRContract.methods.getRootDifficulty().call();
        return [rootHash, rootDiff];*/
        return [rootInfo['rootValue'], rootInfo['rootDifficulty']];
    }


    /**
     * The method getTxLogs from the txHash gives as output the logs contained in the
     * transaction receipt  
     * @param {*} txHash hash of the desired transaction 
     * @returns logs of the transaction
     */
    async getTxReceipt(txHash){
        return await web3.eth.getTransactionReceipt(txHash);
    }

    /**
     * 
     * @param {*} txHash hash of the transaction
     * @returns the block number containing the transaction 
     */
    async getTxBlock(txHash){
        let transactionReceipt = await web3.eth.getTransactionReceipt(txHash);
        if(transactionReceipt == null){
            return -1;
        }
        return transactionReceipt['blockNumber'];
    }

    /**
     * 
     * @param {*} txHash hash of transaction
     * @returns MTP proof that the transaction is in a block
     *  {blockHeader: Block containing tx,
     *  RootReceipt: receipt containing the transaction,
     *  txDifficultyMTPProof: proof of receipt in block }
     */
    async getMMRRootBlockHeaderAndProof(txHash) {
        //STEP 1 - Find the the block containing the actual root
        //find receipt containing transaction
        var txReceipt = await web3.eth.getTransactionReceipt(txHash);
        //Get block containing the receipt from the its blocknumber
        var blockHeaderContainingTx = await this.getSingleBlock( txReceipt['blockNumber'])
        
        //STEP 2 - Return block header, and receipt 
        var txProof = await this.extractMerkleProofReceipt(txHash);
        return {blockHeader: blockHeaderContainingTx,
                //NOT NEEDED - provided in txProof
                //RootReceipt: txReceipt,
                txDifficultyMPTProof: txProof}
    }

    /* ************************** END GET BLOCKS INFORMATION ********************************* */

    /**
     * From txHash to Merkle Proof of transaction receipt
     * This code is a modified version taken from: 
     * https://github.com/zmitton/eth-proof
     * So the credit of this function goes to eth-proof developers
     * (if it works ahahah)
     */
    /**
     * Code modified from https://github.com/zmitton/eth-proof
     * @param {*} txHash hash of the transaction
     * @returns Merkle-Patrica-Proof for the specif transaction in the block
     * {JSONProof: JSONProof, blockContainingTx: targetReceipt.blockHash, txIndex: targetIdx}
     */
    async extractMerkleProofReceipt(txHash){
        //console.log(txHash)
        let targetReceipt = await this.rpc.eth_getTransactionReceipt(txHash)
        if(!targetReceipt){ //throw new Error("txhash/targetReceipt not found. (use Archive node)" + targetReceipt)}
            return null;
        }
        var targetIdx = parseInt(targetReceipt.transactionIndex)

        let rpcBlock = await this.rpc.eth_getBlockByHash(targetReceipt.blockHash, false)
    
        let receipts = await Promise.all(rpcBlock.transactions.map((siblingTxHash) => {
          return this.rpc.eth_getTransactionReceipt(siblingTxHash)
        }))
    
        let tree = new Tree();
    
        //from receipt build Particia Tree
        for(let index = 0; index < receipts.length; index ++){
            let siblingPath = encode(index);
            let serializedReceipt = Receipt.fromRpc(receipts[index]).serialize()
            //console.log(serializedReceipt[0])
            await tree.put(siblingPath, serializedReceipt)
        }
    
        let proof = await Tree.createProof(tree, encode(targetIdx) );
        //console.log( proof)
        let JSONProof = JSON.stringify(proof)
        //console.log(JSONProof)
        return {JSONProof: JSONProof, blockContainingTx: targetReceipt.blockHash, txIndex: targetIdx}
      }



    /**
     * Retrieve all the missing SC calls to update local MMR tree.
     * A SmartFlies invocation emits an event in the chain that can be used to retrieve all 
     * the missed events starting from one block (the last block seen by the Prover in this case) 
     * @param {*} lastLeafInformation index of the last block seen by the Prover
     * @returns arrayOfArrayOfBlocks: array of blocks given as input rlp.encoded,
     *          txHashArray: array of transactions hash containing SC invocation,
     *          latestConfirmedBlockIdx: latest block that has been checked and considered confirmed
     */
      async getMissingMMRBlocks( lastBlockIdxCheckedForUpdate ){
        let singleEvent, txHash, transactionData; 
        // array containing the txHash of the SC invocation 
        let txHashArray = [];
        //SC inputs
        let arrayOfBlocksAsInput = [];

        let lastBlockIdxInChain = await web3.eth.getBlockNumber();
        
        //No blocks to check 
        if( lastBlockIdxCheckedForUpdate > (lastBlockIdxInChain - confirmationBlocks ) ){
            return {};
        }
        
        //get Events from Smart Contract
        let rootEventsArray = await this.MMRContract.getPastEvents('EventLogRootHash',{
            filter: {},
            fromBlock: lastBlockIdxCheckedForUpdate,
            //Check only for blocks that are considered permanent
            toBlock: (lastBlockIdxInChain - confirmationBlocks )
        })
        
        //from all the events extract the input data
        for(let i=0; i<rootEventsArray.length; i ++){
            //get a single event data
            singleEvent = rootEventsArray[i];   
            // get the transaction hash associated with that data
            txHash = singleEvent.transactionHash;
            // Store the txHash in array of transaction 
            // This array make easier to retrieve the peaks of the MMR
            txHashArray.push( txHash );

            //Get the actual transaction that generated the Event
            transactionData = await web3.eth.getTransaction(txHash);
            //Decoding SC input from Transaction (blocks given as input)
            arrayOfBlocksAsInput.push(abiDecoder.decodeMethod(transactionData.input));      
        }
        return {arrayOfArrayOfBlocks: arrayOfBlocksAsInput, txHashArray: txHashArray, latestConfirmedBlockIdx: (lastBlockIdxInChain - confirmationBlocks)}; 
      }

     
      
    /**
     * Get MMRLeaf and last indexes from the chain
     * @param {*} lastBlockIdxCheckedForUpdate index of the last block seen by the Prover
     * @returns 
     *  arrayOfMMRLeafs:  Array containing the MMR leaf missed 
     *  firstBlockIdxes: For each leaf the starting block index that covers
     *  txHashArray: Array containing the update transaction hash 
     *  latestConfirmedBlockIdx: Last block checked on-chain
     */
    async getMissingMMRLeafs(lastBlockIdxCheckedForUpdate){
        let singleEvent, txHash, transactionData; 
        // array containing the txHash of the SC invocation 
        let txHashArray = [];
        //SC inputs
        //Array of MMR leafs
        let arrayOfMMRLeafsAsInput = [];
        //Array of first block index covered in each invocation
        let firstBlockIdxes = [];

        let lastBlockIdxInChain = await web3.eth.getBlockNumber();
        
        //No blocks to check 
        if( lastBlockIdxCheckedForUpdate > (lastBlockIdxInChain - confirmationBlocks ) ){
            return {};
        }
        
        //get Events from Smart Contract
        let rootEventsArray = await this.MMRContract.getPastEvents('EventLogRootHash',{
            filter: {},
            fromBlock: lastBlockIdxCheckedForUpdate,
            //Check only for blocks that are considered permanent
            toBlock: (lastBlockIdxInChain - confirmationBlocks )
        })
        
        //from all the events extract the input data
        for(let i=0; i<rootEventsArray.length; i ++){
            //get a single event data
            singleEvent = rootEventsArray[i];   
            // get the transaction hash associated with that data
            txHash = singleEvent.transactionHash;
            // Store the txHash in array of transaction 
            // This array make easier to retrieve the peaks of the MMR
            txHashArray.push( txHash );

            //Get the actual transaction that generated the Event
            transactionData = await web3.eth.getTransaction(txHash);
            //In the untrusted updater scenario the data input are the MMR leaf and the first block coverd
            let input = abiDecoder.decodeMethod(transactionData.input);
            //INPUT STRUCTURE: {
            // name: 'store',
            // params: [
            //     { name: 'leaf_information', value: [Array], type: 'tuple' },
            //     { name: 'first_block_number', value: '11', type: 'uint64' }
            // ]
            // }
            //the leaf_information
            arrayOfMMRLeafsAsInput.push( input.params[0].value );
            //the first_block_number covered by the leaf
            firstBlockIdxes.push(input.params[1].value);

        }
        return {arrayOfMMRLeafs: arrayOfMMRLeafsAsInput, firstBlockIdxes:firstBlockIdxes , txHashArray: txHashArray, latestConfirmedBlockIdx: (lastBlockIdxInChain - confirmationBlocks)};
      }


      /**
       * Get the last block idx seen by the smart contract
       * @returns Last block idx seen by the smart contract (0 if no invocation has been performed so the last block idx
       * in the chain is provided)
       */
      async getLastBlockIndexSeenBySC(offsetOfBlock = 1){
        //reset variable in order to know if the stored MMR should be deleted
        let reset = false;
        //to simplify code the last block seen by the SC is directly requested to the SC itself 
        let lastBlockNumber = parseInt(await this.getLastBlockIndex());
        console.log("   LastBlock seen by SC:" + lastBlockNumber);
        //so the last blockNumber is unknown -> must be set to the latest seen block number by the SC    
        if(lastBlockNumber == 0){
            console.log("   EMPTY SC - blockIndex will be retrieved from the chain")
            reset = true;
            lastBlockNumber = await web3.eth.getBlockNumber() - offsetOfBlock;
            console.log("   LastBlock seen by SC:" + lastBlockNumber);
        }
        return {lastBlockNumber: lastBlockNumber, reset:reset};

      }

}

module.exports = BlockManager