
/* ********************* REQUIRE ************************* */
const DifficultyMMRTree = require('./DifficultyMMR');
const BlockManager = require('./blockManager');
const fs = require('fs');
const Web3 = require('web3');
const rlp = require('rlp');
const DifficultyNode = require('./DifficultyNode')

//For PRNG - experiment repeatability 
var seedrandom = require('seedrandom') 

/* ********************* END REQUIRE ******************** */

////// Get configuration info
var JSONConfiguration = JSON.parse(fs.readFileSync("./configuration_smartcontract_invocation.json"));
const web3 = new Web3(JSONConfiguration['provider']);
const scenario = JSONConfiguration['scenario'];

////////// USEFUL CONSTANTS ////////////
//Blocks constants - TODO: INVERTED names but code ok
const DifficultyIdx = 11
const TimeIdx = 7
// Proof simulation sizes
//Receipt size estimated from https://ethereum.stackexchange.com/questions/6531/structure-of-a-transaction-receipt
const MTPAndReciptSizeInBytes = 600 //285
const BlockHeaderSizeInBytes = 508
const MMRNodeSizeInBytes = 4*8 + 2*16 + 32 //96
/////////////////////////////////////////

class Prover{

/////////////////////////////// INITIALIZATION /////////////////////////////////////////
    constructor(){  
        //The prover uses the blockManager class to retrieve 
        //information from the chain in the node
        this.BlockManager = null;
        this.latestConfirmedBlockIdx = 0;
        
        //Create or uses an existing DifficultyMMR
        try{
            var JSONmmr = JSON.parse(fs.readFileSync("./Memory/mmrStored.json"));
            this.mmr = new DifficultyMMRTree(JSONmmr['tree'], JSONmmr['leafInfoArray'], JSONmmr['levels_odd_elements']);
        }
        catch(err){
            this.mmr = new DifficultyMMRTree([[]]);
        }

        //array containing the txHashes of the SC call - last element root
        try{
           this.txHashArray = JSON.parse(fs.readFileSync("./Memory/txHashArray.json"));

        }catch(err){
            this.txHashArray = [null];
        }

        //array that contains the first index of the passed blocks 
        try{
            this.blocksIdxLeaf = JSON.parse(fs.readFileSync("./Memory/blocksIdxLeaf.json"));
        }catch(err){
            this.blocksIdxLeaf = []
        }
    }

    /**
     * Since the initialization of the block manager is asynchronous 
     * it can not be performed in the constructor()
     * The initial parameters are set by the prover
     */
    async initializeBlockManager(){
        var id = await web3.eth.net.getId();
        var addresses = await web3.eth.getAccounts();
        this.BlockManager = new BlockManager(id,addresses);
        console.log("***** Selected Scenario "+ scenario +" *****");
        console.log("[INITIALIZATION START]   Updating local MMR...")
        //Different chain synchronization ways to recover Smart Contract invocation info for the two scenarios
        if(scenario == "untrusted"){
            await this.updateLocalMMRUntrustedScenario(this.latestConfirmedBlockIdx);
        } 
        if(scenario == "partiallyTrusted") {
            await this.updateLocalMMRPartiallyTrustedScenario(this.latestConfirmedBlockIdx);
        }
        if(scenario== "semiTrusted"){
            await this.updateLocalMMRSemiTrustedScenario(this.latestConfirmedBlockIdx);
        }
        console.log("[INITIALIZATION END]   Local MMR synchronized!")
    }
////////////////////////////////////////////////////////////////////////////////////////

//////////////////////////// CHAIN UPDATES /////////////////////////////////////////////
    
    /**
     * Send a default transaction for test purposes
     */
    async sendDefaultTransaction(){
        await this.BlockManager.sendDefaultTransaction();
        return {default: "default transaction sent"}
    }

    /**
     * OPTIONAL: Maybe index retrieval here instead of updateSmartContract
     * @param {*} numberOfBlocks number of blocks to be inserted in the SC 
     * @returns txHash of the SC update
     */
    async updateUntrusted(numberOfBlocks, firstBlockOffset = 1){
        console.log("********** BLOCK MANAGER UPDATING SC - Untrusted **********")

        //get last seen block idx by the SC
        let lastBlockInfo =  await this.BlockManager.getLastBlockIndexSeenBySC(firstBlockOffset)
        let lastBlockIdxSeenBySC = lastBlockInfo.lastBlockNumber;
        //If the smart contact was empty reset MMR and associated structured
        //if(lastBlockInfo.reset == true ){
            //Code to reset locally stored MMR
        //}

        //Get the blocks starting form lastBlockIdxSeenBySC to numberOfBlocks
        var arrayOfBlocks = await this.BlockManager.getBlocksData(lastBlockIdxSeenBySC + 1,numberOfBlocks);

        //encode blocks to send to the SC
        var RLPEncodedBlocks = rlp.encode(arrayOfBlocks);

        //send the data to the SC
        var transactionResponse = await this.BlockManager.updateSmartContractUntrusted(RLPEncodedBlocks, lastBlockIdxSeenBySC+1);
        
        //RX: FOR NOW HERE FOR TESTING PURPOSES :) THE MMR MUST NOT BE UPDATE SYNCHRONOUSLY 
        //SURE THAT THE BLOCK ENDED UP IN THE CHAIN
        //Update the MMR stored off-chain by the SmartFlies Prover
        await this.updateLocalMMRUntrustedScenario(this.latestConfirmedBlockIdx);
        console.log("   CURRENT MMR ROOT HASH:" + this.mmr.getRoot().getKeccak256() )
        //////////////////////////////////////////////////////////
            
        return transactionResponse;
    }


    /**
     * The updatePartiallyTrusted 
     * 1- Get the blocks from the chain
     * 2- From the blocks build an MMR leaf
     * 3- Send the update transaction to the smart contract
     * @param {*} numberOfBlocks Number of first block to cover
     * @param {*} firstBlockOffset Offset [TODO: explain better]
     */
    async updatePartiallyTrusted(numberOfBlocks, firstBlockOffset = 1){
        console.log("********** BLOCK MANAGER UPDATING SC - Partially trusted **********")
        //Get blocks from chain 
        //Check if the smart contract has a lastIdx leaf (if 0 the current last block is selected as first block for SC)
        let lastBlockInfo = await this.BlockManager.getLastBlockIndexSeenBySC(firstBlockOffset)
        let lastBlockIdxSeenBySC = lastBlockInfo.lastBlockNumber;
        //If the smart contact was empty reset MMR and associated structured
        //if(lastBlockInfo.reset == true ){
            //Code to reset locally stored MMR
        //}

        //Get the blocks starting form lastBlockIdxSeenBySC to numberOfBlocks
        var arrayOfBlocks = await this.BlockManager.getBlocksData(lastBlockIdxSeenBySC + 1,numberOfBlocks);
        //Build MMR leaf with array of blocks
        //For compatibility the encodig and decoding process has been selected TODO: Better solution 
        arrayOfBlocks = rlp.decode(rlp.encode(arrayOfBlocks))
        var MMRLeaf = await this.createMMRLeafFromArrayOfBlocks(arrayOfBlocks);
        console.log(MMRLeaf);
        //Send transaction with MMR leaf 
        let transactionResponse = await this.BlockManager.updateSmartContractPartiallyTrusted(MMRLeaf, lastBlockIdxSeenBySC+ 1)

        //RX: FOR NOW HERE FOR TESTING PURPOSES :) THE MMR MUST NOT BE UPDATE SYNCHRONOUSLY 
        //SURE THAT THE BLOCK ENDED UP IN THE CHAIN
        //Update the MMR stored offchain
        await this.updateLocalMMRPartiallyTrustedScenario(this.latestConfirmedBlockIdx);
        //console.log("   CURRENT MMR ROOT HASH:" + this.mmr.getRoot().getKeccak256() )
        //////////////////////////////////////////////////////

        return transactionResponse;
    }

    /**
     * @param {*} numberOfBlocks number of blocks to be inserted in the SC 
     * @returns txHash of the SC update
     */
     async updateSemiTrusted(numberOfBlocks, firstBlockOffset = 1){
        console.log("********** BLOCK MANAGER UPDATING SC - Untrusted **********")

        //get last seen block idx by the SC
        let lastBlockInfo =  await this.BlockManager.getLastBlockIndexSeenBySC(firstBlockOffset)
        let lastBlockIdxSeenBySC = lastBlockInfo.lastBlockNumber;
        //If the smart contact was empty reset MMR and associated structured
        //if(lastBlockInfo.reset == true ){
            //Code to reset locally stored MMR
        //}

        //Get the blocks starting form lastBlockIdxSeenBySC to numberOfBlocks
        var arrayOfBlocks = this.BlockManager.getBlocksData(lastBlockIdxSeenBySC + 1,numberOfBlocks);
        var firstBlock = rlp.encode(arrayOfBlocks[0]);
        //set last block if present
        var lastBlock = 0x0;
        if(numberOfBlocks > 1){
            lastBlock = rlp.encode(arrayOfBlocks.at(-1));
        }

        arrayOfBlocks = rlp.decode(rlp.encode(arrayOfBlocks))
        var nodeDifficulty = this.getDifficultyOfBlocks(arrayOfBlocks);

        //send the data to the SC
        //TODO ----
        var transactionResponse = await this.BlockManager.updateSmartContractSemiTrusted(firstBlock, lastBlock, nodeDifficulty);
        
        //RX: FOR NOW HERE FOR TESTING PURPOSES :) THE MMR MUST NOT BE UPDATE SYNCHRONOUSLY 
        //SURE THAT THE BLOCK ENDED UP IN THE CHAIN
        //Update the MMR stored offchain by the SmartFlies Prover
        //TODO -----
        await this.updateLocalMMRSemiTrustedScenario(this.latestConfirmedBlockIdx);
        console.log("   CURRENT MMR ROOT HASH:" + this.mmr.getRoot().getKeccak256() )
        //////////////////////////////////////////////////////////
            
        return transactionResponse;
    }


///////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////// LOCAL MMR UPDATE ////////////////////////////////////////
    
    /**
     * Creates or updates the local MMR using the blocks input retrieved from the chain
     * In the Untrusted updater scenario the transactions contain all the input blocks
     * @param {*} lastBlockWithSCInvocation the index of the last block known having a SC invocation
     */
    async updateLocalMMRUntrustedScenario(lastBlockWithSCInvocation){
        //retrieve the missing SC invocations
        //{arrayOfArrayOfBlocks:, txHashArray:, latestConfirmedBlockIdx:}
        var missingInformation = await this.BlockManager.getMissingMMRBlocks(lastBlockWithSCInvocation);
        //No update needed 
        if(missingInformation.arrayOfArrayOfBlocks == undefined){
            return;
        }
        //update the last block checked from the chain
        this.latestConfirmedBlockIdx = missingInformation.latestConfirmedBlockIdx + 1;
        //array containing the blocks called in every invocation 
        //Format [[block_0, ..., block_n], [], ...., []]
        var arrayOfArrayOfBlocks = missingInformation.arrayOfArrayOfBlocks;

        //Concatenate to the local txHashArray the txHash of the new SC invocation
        this.txHashArray = this.txHashArray.concat(missingInformation.txHashArray);
        var arrayOfBlocks, numberOfBlocksInLeaf;
        //information to build a Difficulty Node
        var newLeafNode;

        //For every SC invocation 
        for(let i=0; i< arrayOfArrayOfBlocks.length; i++){
            //create a leaf node
            newLeafNode = new DifficultyNode()
            //decode array blocks in invocation
            //params[0].value contains the blocks sent to the SC rlp encoded 
            arrayOfBlocks = rlp.decode(arrayOfArrayOfBlocks[ i ].params[0].value)

            //get the number of blocks in this SC invocation 
            numberOfBlocksInLeaf = arrayOfBlocks.length;

            //Store the first block idx and number of blocks covered by the SC invocation
             this.blocksIdxLeaf.push({firstBlockIdx: arrayOfBlocks[0][8].readUIntBE(0, arrayOfBlocks[0][8].length )  ,
                numberOfBlocks: numberOfBlocksInLeaf})

            //given the array of block create an MMR leaf
            newLeafNode = await this.createMMRLeafFromArrayOfBlocks(arrayOfBlocks)


            this.mmr.addLeaf(newLeafNode);
        }
    }



     /**
     * Creates or updates the local MMR using the MMR leafs retrieved from the chain.
     * In the partially-trusted scenario the transactions contain all the MMR leafs and first block index.
     * @param {*} lastBlockWithSCInvocation the index of the last block known having a SC invocation
     */
      async updateLocalMMRPartiallyTrustedScenario(lastBlockWithSCInvocation){
        //retrieve the missing SC invocation
        // {arrayOfMMRLeafs:, firstBlockIdx:, txHashArray:, latestConfirmedBlockIdx:};
        var missingInformation = await this.BlockManager.getMissingMMRLeafs(lastBlockWithSCInvocation);

        //No update needed 
        if(missingInformation.arrayOfMMRLeafs.length == 0){
            return;
        }
        //array containing the leafs
        var arrayOfMMRLeafs = missingInformation.arrayOfMMRLeafs;
        //update the last block checked from the chain
        this.latestConfirmedBlockIdx = missingInformation.latestConfirmedBlockIdx + 1;

        //Concatenate to the local txHashArray the txHash of the new SC invocation
        this.txHashArray = this.txHashArray.concat(missingInformation.txHashArray);
        //information to build a Difficulty Node
        var newLeafNode;

        //For every SC invocation 
        for(let i=0; i< arrayOfMMRLeafs.length; i++){
            //create a leaf node
            newLeafNode = new DifficultyNode();
            //From array to MMR node
            newLeafNode.fromArrayToMMRNode(arrayOfMMRLeafs[i]);
            //decode array blocks in invocation
            //params[0].value contains the blocks sent to the SC rlp encoded 
            //arrayOfBlocks = rlp.decode(arrayOfArrayOfBlocks[ i ].params[0].value)

            //Store the first block idx and number of blocks covered by the SC invocation
            this.blocksIdxLeaf.push({firstBlockIdx: parseInt(missingInformation.firstBlockIdxes[i])  ,
                numberOfBlocks: parseInt(newLeafNode.numberOfBlocksCoverd)})

            this.mmr.addLeaf(newLeafNode);
        }
    }

    /**
     * Get total difficulty of array of blocks
     * @param {*} arrayOfBlocks blocks that compose a leaf 
     * @returns the sum of their difficulty
     */
     getDifficultyOfBlocks(arrayOfBlocks){
        let difficulty = 0;
        for(let i = 0; i< arrayOfBlocks.length; i++){
            //the difficulty of a block is in field 7 and stored as a decimal
            //It can be null on Ganache testnet so this case must be coverd
            if(arrayOfBlocks[i][TimeIdx] != "0x")
                difficulty += parseInt( Number(arrayOfBlocks[i][TimeIdx]) , 10);
        }
        //Ganche scenario: The difficulty of each block will be always set to 0x (undefined)
        //So the difficulty variable will remain set to 0
        //To build a difficulty MMR in this case set that difficulty to a random number
        if(difficulty == 0){
            //difficulty = Math.floor(Math.random() * 100000);
            //deterministic difficulty set to number of blocks covered - useful for testing with Ganche
            difficulty = arrayOfBlocks.length
        }
        return difficulty;
    }

    
    /**
     * Given an array of blocks [ [field_0,..., field_n] , ... ,[field_0,..., field_n] ]
     * build an MMR leaf node from the information
     * @param {*} arrayOfBlocks  array of blocks in the format  [ [field_0,..., field_n] , ... ,[field_0,..., field_n] ]
     * @returns DifficultyNode of the input blocks 
     */
     async createMMRLeafFromArrayOfBlocks(arrayOfBlocks){
        //get the number of blocks
        let numberOfBlocks = arrayOfBlocks.length;
        //the "peak" (hash of the MMR leaf) is the hash of the last leaf
        let peak = await web3.utils.soliditySha3( rlp.encode(arrayOfBlocks[numberOfBlocks - 1]) );
        //take the time and difficulty of the first block covered in the SC call
        let tFirstBlock = arrayOfBlocks[0][DifficultyIdx];
        let tLastBlock = arrayOfBlocks[numberOfBlocks - 1][DifficultyIdx];
        //take the time and difficulty of the last block covered in the SC call
        let dFirstBlock = arrayOfBlocks[0][TimeIdx];
        let dLastBlock  = arrayOfBlocks[numberOfBlocks - 1][TimeIdx];
        //Calculate the total difficulty covered by the blocks
        let nodeDifficulty = this.getDifficultyOfBlocks(arrayOfBlocks);

        //Create MMR leaf from blocks
        let newLeafNode = new DifficultyNode();
        //setting the values on the leaf
        newLeafNode.setValues(
                        peak.toString('hex'),
                        //all these below are integers
                        //NOTES: in partially trusted scenario there are not buffers! (are values) - not used in that scenario
                        tFirstBlock.length == 0     ? 0 : tFirstBlock.readIntBE(0,tFirstBlock.length),
                        tLastBlock.length == 0      ? 0 : tLastBlock.readIntBE(0, tLastBlock.length), 
                        dFirstBlock.length == 0     ? 0 : dFirstBlock.readIntBE(0, dFirstBlock.length), 
                        dLastBlock.length == 0      ? 0 : dLastBlock.readIntBE(0, dLastBlock.length), 
                        nodeDifficulty,
                        numberOfBlocks
                        );
        return newLeafNode;
    }

 ////////////////////////////////////////////////////////////////////////////////////////////////


 //////////////////////////////// PROVING SERVICE ///////////////////////////////////////////////

    /**
     * Given the value of an MMR leaf, gets the leaf index in the MMR tree, the index of the last MMR leaf in the tree,
     * the blockheaders of the blocks composing the input MMR leaf, the MTP proof that a block composing the MMR tree contains 
     * an old MMR update invocation 
     * @params leafValue: Value of the input leaf in the format {leafHashValue:, leafDifficulty:, leafIdx:}; 
     * @returns {leafIdx:               <index of the input MMR leaf>, 
     *           lastLeafIdx:           <index of the last MMR leaf in the tree>,
     *           leafProof:             <Membership proof of the provided MMR leaf (list of MMR node)>,
     *           leafBlocks:            <Blockheader of the blocks composing the MMR leaf provided in input>,
     *           txDifficultyMPTProof:  <Proof that an old MMR update transaction is in one of the blocks composing the input MMR leaf>}
     */
    async getLeafAndProof(leafIndex){
       // var leafIndex  = leafValue['leafIdx']
        // 0 indicate the level from which we want the proof
        console.log("   Getting proof for leaf ... ")
        let leafProof = this.mmr.getLeafProof(leafIndex, 0);
        let lastLeafIndex = this.mmr.getLastLeafIndex();
    
        //Only the block hash containing it
        
        //console.log("   Getting receipt of DifficultyMMR invocation in specific Block")
        //console.log(leafIndex)
        //Obtain the SC call in the leaf
        var txHashOfLeafMMR = this.txHashArray[ leafIndex ];
        //console.log(txHashOfLeafMMR)
        var txReceipt = null;

        //Check if not genesis block
        if(txHashOfLeafMMR != null){
            txReceipt = await this.BlockManager.getTxReceipt(txHashOfLeafMMR);
            txReceipt = { "blockHash": txReceipt.blockHash}
        }

        console.log("   Getting Blocks of leaf ... " )
        //blocksInfoLeaf {firstBlockIdx: firstBlockIdx, numberOfBlocks: numberOfBlocks }
        //get the first block covered by that leaf and the total number of blocks covered by the leaf
        var blocksInfoLeaf = this.blocksIdxLeaf[ leafIndex ];

        var blocksHeaderForLeaf = null;
        //obtain the block associated with the leaf from the chain
        if(blocksInfoLeaf != null){
            //console.log(blocksInfoLeaf)
            blocksHeaderForLeaf = await this.BlockManager.getBlocksData(blocksInfoLeaf['firstBlockIdx'], blocksInfoLeaf['numberOfBlocks'] )
        }
        
        //Get Transaction proof (patricaTree)
        //var patricaTreeProof = null//await this.BlockManager.extractMerkleProofReceipt(txHashOfLeafMMR);
        //var patricaTreeProof = await this.BlockManager.extractMerkleProofReceipt(txHashOfLeafMMR);
        var patricaTreeProof;
        if(txHashOfLeafMMR != null)
            patricaTreeProof = await this.BlockManager.extractMerkleProofReceipt(txHashOfLeafMMR);
        
        return { 
                leafIdx: leafIndex,
                //Maybe not needed
                lastLeafIdx: lastLeafIndex,
                leafProof: leafProof,
                leafBlocks: blocksHeaderForLeaf,
                txDifficultyMPTProof: patricaTreeProof }
    }
   
    /**
     * Get the proof of a MMR leaf (all the MMR nodes needed to get to the MMR root)
     * given its hash.
     * @param {*} leafHash given the hash value of a leaf find its index 
     * @returns an array with:
     *  [0] the position of the leaf in the leaves of MMR tree
     *  [1] the number of leaves in the MMR tree
     *  [2] Proof of the leaf that has as peak the leafHash
     */ 
    getLeafOnlyMMRProof(leafHash){
        let leafIndex = this.mmr.getLeafIndex(leafHash);
        //the leaf hash doesn't exist 
        if(leafIndex == -1)
            return null;
        let proof = this.mmr.getLeafProof(leafIndex, 0);
        let lastLeafIndex = this.mmr.getLastLeafIndex();
        //OPTIONAL: FORMAT BETTER IF NEEDED
        return [leafIndex, lastLeafIndex, proof];
    }

    /**
     * Return the MMR root and the data needed to verify it
     * @returns Root and proof stored in the SC provided by BlockManager
     * format: {blockHeader:            <header of block containing the root> ,
     *          txDifficultyMPTProof:   <MTP proof of the receipt containing the hash of the MMR> ,
     *          rootDifficultyNode:     <local MMR root not hashed> }
     */
    async getSCRootProof(){
        //get last transaction
        var lastIdxTxArray = this.txHashArray.length - 1
        
        //MMR not existing case
        if(lastIdxTxArray == 0){
            return  {error: "No data available for SC"}
        }

        //STEP 1: Get the blockheader of the block containing the MMR root and the MTP proof of update transaction in that block 

        //Given the last transaction to the SC get the last block containing the invocation (newest root)
        //{blockHeader: blockHeaderContainingTx, txDifficultyMPTProof: txProof}
        var rootSC = await this.BlockManager.getMMRRootBlockHeaderAndProof(this.txHashArray[lastIdxTxArray]);
        //adding a new field: the Difficulty node of the root
        //used since it in the block there is only the hash
        
        //STEP 2: From the local MMR tree get the full MMR root (in the receipt there is only the hash of the MMR root)
        //get the mmr root
        var rootDifficultyLocal = this.mmr.getRoot();
        rootSC.rootDifficultyNode = rootDifficultyLocal;

        return rootSC;
    }


    /**
     * Given the transaction hash it gives back the index of the block containing it
     * @param {*} txHash 
     * @returns block idx containing the selected transaction
     */
     async getBlockIdxPerTransaction(txHash){
        return await this.BlockManager.getTxBlock(txHash)
    }

    /**
     * 
     * @returns local MMR root
     */
    getMMRRoot(){
        return this.mmr.getRoot();
    }

    // /**
    //  * NOT USED 
    //  * @returns Smart Contract root from log
    //  */
    // async getSCRootTest(){
    //     return await this.BlockManager.getRootFromLog();
    // }

    //////////////////// GET PROOFS STARTING FROM DIFFERENT INFORMATION ////////////////
    /**
     * This method given the relative difficulty offers 
     * +    the leaf at that difficulty
     * +    the blocks covered by that leaf
     * +    the txHash of the SC call 
     * +    the Patricia Proof of the txHash 
     * +    the proof that the leaf belongs to the Difficulty mmr tree
     * @param {*} relativeDifficulty number from 0 to 1
     * @returns proof of a leaf 
     */
    async getLeafAndProofFromDifficulty(relativeDifficulty){
        console.log("   Retreiving leaf from difficulty... ")
        //leafValue = {leafHashValue: , leafDifficulty: , leafIdx: }
        var leafIdx = this.mmr.getLeafFromDifficulty(relativeDifficulty);
        //console.log(leafValue)
        console.log("Leaf associated with target difficulty value")
        //{leafHashValue: , leafDifficulty: , leafIdx: }
        return await this.getLeafAndProof(leafIdx);
    }

    /**
     * From blockIndex to full proof
     * @param {*} blockIdx block index of which the proof is requested 
     * @returns Proof 
     */
    async getLeafAndProofFromBlockIdx(blockIdx){
        //find in the leaf that covers this block
        var leafIdx = this.findLeafIdxFromBlock(blockIdx);
        if(this.blocksIdxLeaf[leafIdx]['firstBlockIdx'] > blockIdx 
        ||
        this.blocksIdxLeaf[leafIdx]['firstBlockIdx'] + this.blocksIdxLeaf[leafIdx]['numberOfBlocks'] <= blockIdx  )
            return {error: "Block is not covered by the tree"}
        //var leaf = this.mmr.getLeafFromIdx(leafIdx);
        return await this.getLeafAndProof(leafIdx);
    }

    //RX: this is the last step of the algorithm -> from the tx the user is interested on provide the proof
    /**
     * TODO: Here maybe an error test on browser
     * @param {*} txHash txHash of a transaction that prover wants to verify
     * @returns  Proof of leaf containing the block containing that transaction
     */
    async getLeafAndProofFromTxHash(txHash){
        //Get block where the transaction hash is
        var blockIdx = await this.BlockManager.getTxBlock(txHash);
        if(blockIdx < 0){
            return {"error":"The transaction selected doesn't exist in the chain"}
        }
        console.log("TxFound at block " + blockIdx)
        //Get leaf where the Block is - from this.blocksIdxLeaf
        var leafIdx = this.findLeafIdxFromBlock(blockIdx);

        //check if the leaf exists
        if(this.blocksIdxLeaf[leafIdx] == null){
            return {"error":"the prover has an empty MMR stored - try another prover or try later"}
        }        
        //check if the block index is covered by the tree 
        //above first leaf
        if(this.blocksIdxLeaf[leafIdx]['firstBlockIdx'] > blockIdx 
            ||
           this.blocksIdxLeaf[leafIdx]['firstBlockIdx'] + this.blocksIdxLeaf[leafIdx]['numberOfBlocks'] <= blockIdx  )
           return {error: "Block is not covered by the tree"}
        //var leaf = this.mmr.getLeafFromIdx(leafIdx);
        return await this.getLeafAndProof(leafIdx);

    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////// UTILITIES ////////////////////////////////////////////////////
    
    /**
     * Format Information
     * this.blocksIdxLeaf {firstBlockIdx: firstBlockIdx, numberOfBlocks: numberOfBlocks }
     * @param {*} blockIdx Index of block to find
     * @returns Index of leaf containing that block
     */
    findLeafIdxFromBlock(blockIdx){
        let arr = this.blocksIdxLeaf;
        let start=0, end= arr.length-1;
        let mid = -1;
        // Iterate while start not meets end
        while (start<=end){
            // Find the mid index
            mid=Math.floor((start + end)/2);
            // If element is present at mid, return True
            if (parseInt(arr[mid]['firstBlockIdx']) == blockIdx ) return mid;

            // Else look in left or right half accordingly          
            if (parseInt( arr[mid]['firstBlockIdx'] ) < blockIdx)
                 start = mid + 1;
            else
                 end = mid - 1;
        }
      
        return mid;
    }
    


    /**
     * 
     * @returns leaves of local mmr
     */
    getLocalMMRLeafs(){
        return {leafs: this.mmr.getLeafArray()};
    }


    /**
     * @param {*} relativeDifficulty number from 0 to 1 
     * @returns 
     */
    getBlockFromDifficulty(relativeDifficulty){
        return this.mmr.getBlockFromDifficulty(relativeDifficulty);
    }

    ///////////////////////////////////// SERIALIZATIONS /////////////////////////////////////////
    serializeMMR(){
        fs.writeFile('./Memory/mmrStored.json', JSON.stringify(this.mmr), { flag: 'w' }, function(err) {
            console.log(err);
        })
        
    }
    serializeTxHashArray(){
        fs.writeFile('./Memory/txHashArray.json', JSON.stringify(this.txHashArray), { flag: 'w' }, function(err) {
            console.log(err);
        })
    }

    serializeBlocksIdxLeaf(){
        fs.writeFile('./Memory/blocksIdxLeaf.json', JSON.stringify(this.blocksIdxLeaf), { flag: 'w' }, function(err) {
            console.log(err);
        })
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////// EXPERIMENTS: PROVING SIMULATION AND SIZES ///////////////////////////////////
    

    /**
     * Fill a dummy MMR tree
     * @param {*} numberOfBlocksPerLeaf number of blocks per leaf (blocks/leaf)
     * @param {*} chainLength length of the chain (blocks)
     */
    fillDummyMMR(numberOfBlocksPerLeaf, chainLength){
        console.log("--- FILLING DUMMY TREE");
        //reset the MMR
        this.mmr = new DifficultyMMRTree([[]]);
        // let numberOfBlocksSimulation = chainLength
        let numberOfLeafs = Math.ceil(chainLength/numberOfBlocksPerLeaf)
        //fill a dummy mmr tree
        for(let i = 0; i < numberOfLeafs; i++){
            //dummy leaf to be added
            let dummyLeaf = new DifficultyNode(
                {
                    peak: "0xf6a1b2e3501f269e6acbd476ab5a1702679cdd29be4bc7cc9bc9031f90105ad5",
                    tFirstBlock: 1,
                    tLastBlock: 1,
                    dFirstBlock: 1,
                    dLastBlock: 1,
                    nodeDifficulty: numberOfBlocksPerLeaf,
                    numberOfBlocksCoverd: numberOfBlocksPerLeaf
                }
            );  
            //console.log(dummyLeaf)
            this.mmr.addLeaf(dummyLeaf)
        }
    }

    /**
     * Generate a proof for measuring purposes
     * @param {*} numberOfBlocksPerLeaf Number of blocks per leaf
     * @param {*} c Adversary fraction of power
     * @param {*} L Blocks to always check
     * @param {*} lambda Security coefficient
     * @param {*} simulationSeed Seed of simulation
     * @returns Size of proof for simulation
     */
    generateProofSimulation(numberOfBlocksPerLeaf,c,L, lambda, chainLength, simulationSeed){
        // Global PRNG: set Math.random. This allows to have repeatable simulations
        seedrandom(simulationSeed, { global: true });
        
        console.log("Generating proof simulation ...");

        let generatedRandomNumber; 
        //Proof length - no duplicates
        let totalProofLength = 0;
        //Proof length - with duplicates
        let totalProofLengthWithDuplicates = 0;

        let arrayOfAlreadySampled = [];
        let MMRRoot = this.getMMRRoot();;
        let proofLeaf;
        let proofLeafIdx;
        
        //let startingIntervalProb = 0; 
        c = parseFloat(c)

        //Directly from paper
        //var kFraction = Math.ceil( Math.log(L /  chainLength)
        //        / Math.log(c) )
        
        ///// TODO: Discussion on this parameter with Pericle 15/9/2022 //////
        let numberOfLeafs = Math.ceil(chainLength/numberOfBlocksPerLeaf)
        //Original FlyClient paper n = chainLength so 
        var n = numberOfLeafs*numberOfBlocksPerLeaf
        ///////////////////////////////////////////////////////////////////////
        
        var wightPercentage = L/n
        var kFraction = Math.log(L /  n) / Math.log(c) 
        var mQueries = Math.ceil ( lambda/ (Math.log( 1 - 1/kFraction) / Math.log(0.5)) ) 
        
        // RX  This is not like in the FlyClient paper where is suggested to check more leafs in case of multiple block per leaf
        //VERSION NOT FLYCLIENT
        //var numberOfLeafsToCheck = Math.ceil( mQueries / numberOfBlocksPerLeaf) 
        //VERSION FLYCLIENT 
        //var numberOfLeafsToCheck = mQueries * numberOfBlocksPerLeaf;
        // ////

        //ROOT
        //let proof = this.getSCRootProof();
        //one block + receipt + MPT proof 
        totalProofLength += BlockHeaderSizeInBytes + MTPAndReciptSizeInBytes //+ MMRNodeSizeInBytes      
        
        //GENESIS
        //For the simulation only the leaf is taken and not the full proof
        //get the leaf information 
        //proofLeafIdx = this.mmr.getLeafFromDifficulty(0);
        //Array of MMR nodes to verify it
        //proofLeaf = this.mmr.getLeafProof(proofLeafIdx);
        //totalProofLength += this.getSimulatedProofLengthInByte(proofLeaf, numberOfBlocksPerLeaf);
        //the genesis has no old SC invocation
        //totalProofLength -= MTPAndReciptSizeInBytes;
        //arrayOfAlreadySampled.push(0)
        
        //get first and last block covered by the "smart contract" (simulated)
        //let genesisBlockIdxForSc = 0 //parseInt( Number( proofLeaf.leafBlocks['0']['8']),  10 );
        //let lastBlockCoverdBySC = genesisBlockIdxForSc + MMRRoot.numberOfBlocksCoverd - numberOfBlocksPerLeaf; 
        

        //let lastSeenIdx = lastBlockCoverdBySC;

        ///////////////////////// Check last L elements ///////////////////////////////
        //console.log("--- CHECKING LAST L ELEMENTS");
        //let lastLeafIdx = this.mmr.getLastLeafIndex();
        //L blocks check commented - TODO: Maybe improve this and check results
        // while( checkedBlocks < L){
        //     //check if MMR leaf already sampled
        //     if( arrayOfAlreadySampled.includes(lastLeafIdx) == true){
        //         break;
        //     }
        //      //proofLeaf = await this.getLeafAndProofFromBlockIdx( lastSeenIdx);
        //      proofLeaf = this.mmr.getLeafProof(lastLeafIdx);
        //      arrayOfAlreadySampled.push(lastLeafIdx);

        //      totalProofLength += this.getSimulatedProofLengthInByte(proofLeaf, numberOfBlocksPerLeaf);
        //      //lastSeenIdx = lastSeenIdx - numberOfBlocksPerLeaf;
        //      checkedBlocks = checkedBlocks + numberOfBlocksPerLeaf;      
        //      lastLeafIdx = lastLeafIdx - 1;
        // }
        // console.log("------ L:" + checkedBlocks);
        //////////////////////////////////////////////////////////////////////////////
        
        //For now the the duplicates are not taken in account
        totalProofLengthWithDuplicates = totalProofLength

        let nodes_already_obtained = []
        let proofLeafNoDuplicateNodes = []

        console.log("--- STARTING RANDOM QUERIES");
        for(let i=0;i<mQueries;i++){
            //Generate random number [0,1] following Bunz distribution
            generatedRandomNumber = this.randomSampler(wightPercentage )
            //get the leaf index that covers the requested difficulty
            proofLeafIdx = this.mmr.getLeafFromDifficulty(generatedRandomNumber);
            //get the leaf corresponding to the index              
            proofLeaf = this.mmr.getLeafProof(proofLeafIdx);

            proofLeafNoDuplicateNodes = []
            //// NEW OPTIMIZATION - avoid downloading two times the nodes already obtained

            //for every MMR node received 
            for(let i=0; i<proofLeaf.length; i++){
                //If during the proof we never got the MMR node in the proof
                // we will add it to the known nodes 
                if(nodes_already_obtained.includes(proofLeaf[i]) == false){
                    proofLeafNoDuplicateNodes = proofLeafNoDuplicateNodes + [proofLeaf[i]];
                    nodes_already_obtained = nodes_already_obtained + [proofLeaf[i]];
                }
            }

            ////

            //Add the proof size to the duplicates one
            totalProofLengthWithDuplicates += this.getSimulatedProofLengthInByte(proofLeaf, numberOfBlocksPerLeaf);
            //Check if this block has already been sampled, if not update the proof size
            if( arrayOfAlreadySampled.includes(proofLeafIdx) == false){
                //Include in already checked elements
                arrayOfAlreadySampled.push(proofLeafIdx);
                totalProofLength += this.getSimulatedProofLengthInByte(proofLeafNoDuplicateNodes, numberOfBlocksPerLeaf);
            }

        }
        console.log("*************** STATISTICS ********************")
        console.log("INFO: blocks per leaf: " + numberOfBlocksPerLeaf + " Leafs: "+ numberOfLeafs)
        console.log("INFO: #queries: " + mQueries + " K: " + kFraction)
        console.log("Number of sampled leafs "+arrayOfAlreadySampled.length)
        console.log("Number of sampled blocks "+ arrayOfAlreadySampled.length*numberOfBlocksPerLeaf)
        console.log(totalProofLength)
        console.log(totalProofLengthWithDuplicates)
        console.log(wightPercentage)
        console.log("**********************************************")

        //number of intervals to check
        //let blocksInInterval;
        //var numberOfIntervalsToCheck =  Math.floor( Math.log2(MMRRoot.numberOfBlocksCoverd) );
        //let intervalDimentionCurrent = 1;
        //for(var j = 0; j < numberOfIntervalsToCheck; j++){
        //    for(var i=0; i < numberOfLeafsToCheck; i ++ ){
        //        generatedRandomNumber = this.randomSampler(c , kFraction )
        //        generatedRandomNumber = startingIntervalProb + intervalDimentionCurrent * generatedRandomNumber
        //        proofLeaf = this.getLeafAndProofFromDifficulty(generatedRandomNumber);
        //        
        //        if( arrayOfAlreadySampled.includes(proofLeaf.leafIdx) == true){
        //            continue;
        //        }
        //        
        //        totalProofLength += this.getProofLengthInByte(proofLeaf);
        //    }
        //    intervalDimentionCurrent = intervalDimentionCurrent / 2;
        //    startingIntervalProb = startingIntervalProb +  intervalDimentionCurrent;
        //    blocksInInterval = intervalDimentionCurrent * MMRRoot.numberOfBlocksCoverd;
        //    if(blocksInInterval < 50 || blocksInInterval < numberOfBlocksToCheck ){
        //        break;
        //    }
        //}
        return {proofSizeNoDuplicates:totalProofLength, proofSizeWithDuplicates:totalProofLengthWithDuplicates};
    }

    /**
     * RX: What is this?
     * Generate proof for one interval considering a day of working
     * @param {*} numberOfBlocksPerLeaf 
     * @returns 
     */
    generateProofForInteval(numberOfBlocksPerLeaf){
        let totalProofLength = 0;
        let proofLeaf;
        var generatedRandomNumber = 0;
        var blocksNum = 5760
        var size = Math.ceil(blocksNum/numberOfBlocksPerLeaf)

        //fill a dummy mmr tree with specified time
        for(let i = 0; i < size; i++){
            let dummyLeaf = new DifficultyNode();  
            //console.log(dummyLeaf)
            this.mmr.addLeaf(dummyLeaf)
        }

        //get the dummy root
        let MMRRoot = this.getMMRRoot();
        //console.log(MMRRoot)

        //L fixed to 50
        //This is called m in the paper TODO: Modify - ERROR Maybe
        var numberOfBlocksToCheck = Math.ceil( Math.log(50 / blocksNum)
                / Math.log(0.5) );

        var numberOfLeafsToCheck = Math.ceil( numberOfBlocksToCheck / numberOfBlocksPerLeaf) 
        console.log("NUMB OF LEAFS TO CHECK: " + numberOfLeafsToCheck)
        for(var i=0; i < numberOfLeafsToCheck; i ++ ){
            //c 0.5
            generatedRandomNumber = this.randomSampler(0.5 , numberOfBlocksToCheck )
            console.log(generatedRandomNumber)
            proofLeaf = this.mmr.getLeafFromDifficulty(generatedRandomNumber);
            proofLeaf = this.mmr.getLeafProof(proofLeaf.leafIdx);

            //Comment this to allow duplicates
            //if( arrayOfAlreadySampled.includes(proofLeaf.leafIdx) == true){
            //    continue;
            //}
            
            totalProofLength += this.getProofLengthInByte(proofLeaf, numberOfBlocksPerLeaf);
        }
        console.log("NUMB OF LEAFS TO CHECK: " + numberOfLeafsToCheck)
        return totalProofLength;

    }

    /**
     * @param {*} c Estimation of power of the attacker 
     * @param {*} k number blocks to check before asserting the chain is valid
     * @returns random number from 0 to 1 to sample
     */
    //randomSampler(c, k){
    //    //generate a random number from 0 to 1 
    //    // using the current time as seed (From documentation)
    //    var y = Math.random();
    //    //CDF from g(x)
    //    var fraction_of_difficulty = 1 - Math.exp(y*k*Math.log(c));
    //    return fraction_of_difficulty;
    //}

    /**
     * @param {*} L_n difficulty already checked with L
     * @returns random number from 0 to 1 to sample
     */
    randomSampler(L_n){
        //generate a random number from 0 to 1 
        // using the current time as seed (From documentation)
        // generate random number between [0, 1-L_n)
        var y = Math.random();
        //CDF from g(x)
        var fraction_of_difficulty = 1 - L_n**y;
        //console.log(fraction_of_difficulty)
        return fraction_of_difficulty; //*(1-L_n);
    }


    /**
     * @param {*} leafExtracted  JSON proof for a leaf
     * @returns Size in bytes
     */
    getProofLengthInByte(proof, blockPerLeaf){
        //MMR proof size
        var numberOfLeafsInProof = proof.leafProof.length;
        console.log("NUMBER OF LEAFS IN PROOF: " + numberOfLeafsInProof)
        // MMR Proof in bytes 6 integer fields + 1 hash  
        //MMR Node
        var sizeInByte = (4*8 + 2*16 + 32)*numberOfLeafsInProof;
        
        //Block in leaf size - block header size fixed to 508 for a fair comparison
        var numberOfBlocksInLeaf = blockPerLeaf; 
        console.log("NUMBER OF BLOCKS PER LEAF: " + proof.leafBlocks.length);
        sizeInByte += (508 * numberOfBlocksInLeaf);
        
        //MTP Proof - a proof + one hash + one integer field [TODO: This value has been selected by the rule of thumb]
        var sizeOfMPT = 320 + 320/* (proof.txDifficultyMPTProof !=null? 
            JSON.stringify( proof.txDifficultyMPTProof.JSONProof ).length
            :0)*/
        //Leafs + Blocks + MTP + hash containing it + tx position
        sizeInByte =  sizeInByte + sizeOfMPT + 32 + 8;
        return sizeInByte;
    }

    /**
     * Simulate the proof size given only the needed number of MMR peaks
     * @param {*} arrayOfMMRPeaks array of MMR peaks
     * @param {*} blockPerLeaf Blocks contained in the leaf
     * @returns simulated size in bytes of the proof
     */
    getSimulatedProofLengthInByte(arrayOfMMRPeaks, blocksPerLeaf){
        var numberOfLeafsInProof = arrayOfMMRPeaks.length;

        //console.log("NUMBER OF LEAFS IN PROOF: " + numberOfLeafsInProof)
        // MMR Proof in bytes 6 integer fields + 1 hash  
        var sizeInByte = (MMRNodeSizeInBytes)*numberOfLeafsInProof;
            
        //Block in leaf size - block header size fixed to 508 for a fair comparison
        sizeInByte += (BlockHeaderSizeInBytes * blocksPerLeaf);
            
        //MTP Proof - a proof + one hash + one integer field
        var sizeOfMPT = MTPAndReciptSizeInBytes
        /* (proof.txDifficultyMPTProof !=null? JSON.stringify( proof.txDifficultyMPTProof.JSONProof ).length:0)*/
        
        //MMRNodes + Blockheaders + MTPProof receipt + hash of block containing transaction receipt containing  + tx position
        sizeInByte =  sizeInByte + sizeOfMPT + 32 + 8;
        return sizeInByte;
    }
    
}

module.exports = Prover;
// let values = []
//let prover = new Prover()
// for(let i = 0; i<2000; i++){
//     values.push(prover.randomSampler(0.5,7));
// }
// values.sort()

// let count = 0
// console.dir(values, {'maxArrayLength': null})
// for(let i=0; i<values.length; i++){
//     if(values[i] > 0.9)
//         count++
// }

// console.log(count)

//prover.fillDummyMMR(128, 5760)
//prover.generateProofSimulation(128,0.5,50,10,5760)