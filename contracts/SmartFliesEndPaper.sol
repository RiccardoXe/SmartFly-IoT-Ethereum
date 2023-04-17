pragma solidity >=0.4.25 <0.7.0;
//Default feature since pragma 0.8.0 in solidty
pragma experimental ABIEncoderV2;


/**
 * @author Riccardo Xefraj
 * @title Merkle Mountain Range Light - peaks only solidity library
 *
 * @dev The index of this MMR implementation starts from 1 not 0.
 *      And it uses keccak256 for its hash function
 */

contract SmartFliesEndPaper{
    
    //event to log the MMR Root data in the invocation Receipt
    event EventLogRootHash(bytes32 _rootHash);

    struct BlockNode {
        //this is the hash value of a subtree 
        bytes32 peak;
        //first and last timestamp
        uint64 timestampFirstBlockCoverd;
        uint64 timestampLastBlockCoverd;
        //first an last difficuly transitions of blocks
        uint64 difficultyFirstBlockCoverd;
        uint64 difficultyLastBlockCoverd;
        //Difficulty covered by current node
        uint128 NodeDifficulty;
        //number of blocks covered (is possible to have this value from numberOfLeaf before and after SC update)
        //but the proof must be provvided from storage
        uint128 NumberOfBlocksCoverd;
    }

    struct Tree {
        //numberOfLeafs: number of Leafs in the Tree
        uint128 numberOfLeafs;
        //lastBlockNumer: Index of last Block given as input to the smart contact
        uint64 lastBlockNumber;
        //blockWithLastUpdate: the block index that contains SC call
        uint64 blockWithLastUpdate;
        //peaks: map containg the peaks 
        mapping(uint => BlockNode) peaks;
    }

    //Tree in storage
    Tree tree;


    /** the resetTree function resets the tree if the is not possible to perform a new update
        From the benchmarks we can safely assume that if the MMR is not update once every 1000 blocks
        it can not be update any more, so we can reset it and start a new MMR with a new genesis
     */
    function resetTree( ) public {
        if(tree.blockWithLastUpdate < block.number - 1000){
            tree.numberOfLeafs = 0;
            tree.lastBlockNumber = 0;
            tree.blockWithLastUpdate = 0;
        }
    }

    /**
        store - check the block-headers validity and if valid calculates with them the MMR leaf
        and add the new MMR leaf in the MMR. 
        IN:
            - data_of_blocks: RLP encoded block-headers of blocks to add to MMR tree
        blockheader fields 
            0- parentHash 1- sha3Uncles 2- miner 3- stateRoot 4- transactionsRoot
            5- receiptsRoot 6- logsBloom 7- difficulty 8- number 9- gasLimit        
            10- gasUsed 11- timestamp 12- extraData 13- mixHash 14- nonce 
     */
    function store(bytes calldata data_of_blocks) external{
        
        //Form bytes to RLP array - every element in this list is a block header
        RLPItem[] memory arrayOfBlocks =  toList( toRlpItem(data_of_blocks));
        //Get first block number 
        uint64 first_block_number = uint64( toUint( getRLPElementFromPosition( arrayOfBlocks[0], 8) ) );
        
        //Get tree information
        uint64 lastBlockNumberInSC = tree.lastBlockNumber;
        uint64 blockWithLastUpdateSC = tree.blockWithLastUpdate;
        
        //Check that there are no missing blocks         
        require(lastBlockNumberInSC + 1 == first_block_number || lastBlockNumberInSC == 0,
                 "[Blocks skipped]: Input block index different from next block index required by smart contract ");
        
        //Get the last block number 
        uint64 last_block_number = uint64( first_block_number +  arrayOfBlocks.length - 1 );

        //Check if there is a SC invocation in the blocks given as input - if not genesis block
        require(blockWithLastUpdateSC <= last_block_number || blockWithLastUpdateSC == 0,
                 "[No old SC invocation in blocks]: Since the block is not a genesis block an old SC invocation must be present");
        
        //Blocks validity check and leaf node creation
        BlockNode memory leaf_information;

        //Check headers validity
        {
            leaf_information.NodeDifficulty = 0;
            leaf_information.NumberOfBlocksCoverd = last_block_number - first_block_number + 1;
            
            bytes32 targetBlockHeader;
            bytes32 obtainedBlockHash;
            bool next_block_decoded = false;
            uint memPtr;
            uint dataLen;
            RLPItem[] memory block_data_decoded;
            RLPItem[] memory block_data_decoded_next;

            //Get the number of items in a block (not fixed in case of HardForks that changes headers)
            uint items = numItems(arrayOfBlocks[0]);
            //Allocate array that will contain the blocks fields
            block_data_decoded = new RLPItem[](items);
            block_data_decoded_next = new RLPItem[](items);

            //STEP 1) Check if at least 1 block is visible on the chain 
            require(blockhash(last_block_number)!=0,
                        "[No BlockHash accessible]: the blockhash(index) function must be able to get at least 1 block hash");

            //STEP 2) for every block perform hash check (if a block has been skipped is also detected)
            for (uint i=first_block_number; i<=last_block_number; i++){
                    //Get the blockhash of a block i from chain seen by SC
                    targetBlockHeader = blockhash(i);

                    //If next_block_decoded is false, the block_data_decoded must be obtained by translating the block_data to a list
                    //Else we have already translated to a list the current block during the security checks [Saves gas by minimizing memory usage]
                    if(next_block_decoded == false){
                        //decode rlp and get back as an array - the structure can be found in the documentation
                        
                        //Extract fields from current block to calculate the MMR leaf
                        //- equivalent to the above toList();
                        memPtr = arrayOfBlocks[i - first_block_number].memPtr +
                        _payloadOffset(arrayOfBlocks[i - first_block_number].memPtr);
                        for (uint j = 0; j < items; j++) {
                            dataLen = _itemLength(memPtr);
                            block_data_decoded[j] = RLPItem(dataLen, memPtr); 
                            memPtr = memPtr + dataLen;
                        }
                    } else {
                        block_data_decoded = block_data_decoded_next;
                    }

                    //STEP 3) Perform security checks untrusted updater
                    // Security Check [See documentation] If at least 1 block is accessible:
                    //    + since every block is linked, if we have at least 1 block readable by the smart contract from 
                    //    its chain we can verify the sequence of blocks 

                    //get the blockhash for the block i from the data given as input to the SC
                    obtainedBlockHash =  rlpBytesKeccak256(arrayOfBlocks[i - first_block_number]);
                    
                    //If the blockhash is not accessible by the SC (Check blocks concatenation)
                    if(targetBlockHeader == 0){
                        //get next block and check if parent hash matches

                        //Extract fields from the next block to verify that blocks are chained
                        //- equivalent to the above toList();
                        memPtr = arrayOfBlocks[(i + 1) - first_block_number].memPtr +
                        _payloadOffset(arrayOfBlocks[(i + 1) - first_block_number].memPtr);
                        for (uint j = 0; j < items; j++) {
                            dataLen = _itemLength(memPtr);
                            block_data_decoded_next[j] = RLPItem(dataLen, memPtr); 
                            memPtr = memPtr + dataLen;
                        }
                        
                        //check if the next block has the same parent hash
                        require(uint(obtainedBlockHash) ==  toUint (block_data_decoded_next[0]),
                                "[BlockHash inaccessible AND Chain Error] The ParentHash of the next block is not equal to the hash of current block");
                        //The next block has been already converted to list, use it as current block in next iteration
                        next_block_decoded = true;
                    }
                    //if the block is accessible by the SC (Check if seen hash is equal to the calculated one)
                    else{
                        //require value obtained from the chain matches the one passed as input
                        require(targetBlockHeader == obtainedBlockHash,
                                "[BlockHash accessible AND Block Hash Not Matching] - are you sending the correct information?(correct index and data)");
                        //The next block should be converted to a list in next iteration, to use it as current block
                        next_block_decoded = false;
                    } 

                    //STEP 4) Store information to create leaf node
                    // sum difficulties in this form put assert/Check for overflows
                    leaf_information.NodeDifficulty += uint128 (  toUint(block_data_decoded[7]) );
                    
                    //[See documentaion] Store data for difficulty transitions checks
                    //store first block information in the leaf
                    if( i == first_block_number ){
                        //timestamp of first block
                        leaf_information.timestampFirstBlockCoverd = uint64(  toUint(block_data_decoded[11]));
                        //difficulty of first block
                        leaf_information.difficultyFirstBlockCoverd = uint64(  toUint(block_data_decoded[7]));
                    }
                    //store last block information in the leaf
                    if( i == last_block_number){
                        //NEW HASH UPDATE: also set the leaf_information hash here
                        leaf_information.peak = targetBlockHeader;
                        //timestamp of last block 
                        leaf_information.timestampLastBlockCoverd = uint64(  toUint(block_data_decoded[11]));
                        //difficulty of last block
                        leaf_information.difficultyLastBlockCoverd = uint64(  toUint(block_data_decoded[7]));
                    }

            }

            //////////////////////////////////// TESTING /////////////////////////////////////////
            //TODO: Remove testing in real deploy. Good for benchmarks and tests
            //In Ganache the difficulty of each block is 0x, so a dummy difficulty for the MMR leaf
            //has been choosen.
            
            //Set the difficulty to the random transaction root. Good for gas cost estimation.
            //This avoid SSTORE overwrites in the invocations
            //leaf_information.NodeDifficulty = uint128( toUint(block_data_decoded[4]));
            // this below not good for cost prefer above code
            leaf_information.NodeDifficulty = uint128( leaf_information.NumberOfBlocksCoverd );
            //////////////////////////////////////////////////////////////////////////////////////
        }
            
        //update the SC status
        updateStorageTreeData(last_block_number);
        //update the MMR 
        calculatePeaksAndRoot(leaf_information);
    }

    /**
        + Update the SC status by increasing the number of leaves by one, 
        + The last block number seen by the tree is set to the last block given as input by 
         the SC
        + The current block number saved (block that contain the SC invocation)
     */
    function updateStorageTreeData(uint64 last_block_number) private{
        // Write in storage - should be a single SStore
        //Update the number of leaves
        tree.numberOfLeafs = tree.numberOfLeafs + 1;
        //Store the last block seen by the SC
        tree.lastBlockNumber = last_block_number;
        //Store the informaion about the block containing the last invocation 
        tree.blockWithLastUpdate = uint64( block.number );
    }

    /**
        Store or overwrite a peak in the peaks array
        IN:
            - leaf_information: Node to as peak in the MMR
            - treePeakLastIdx: Position where to insert the peak in the peaks map
     */
    function updateStorageMMRData(BlockNode memory leaf_information, uint treePeaksLastIdx) private{
        tree.peaks[uint(treePeaksLastIdx)] = leaf_information;
    }

    /**
        This function calculates the new peak and the MMR root and logs it
        IN:
            - leaf_information: Leaf node to insert in the MMR 
     */
   function calculatePeaksAndRoot(BlockNode memory leaf_information) 
                                private{
        //Calculate the number of hashes that must be performed to get to the new peak
        uint128 numberOfLeafsInSC = tree.numberOfLeafs;
        //The number of hashes is the number of bits that 
        // rappresent the number of leafs in the MMR that from 1 has changed to 0
        uint countOfHashes = calculateNumbOfHash(numberOfLeafsInSC - 1);

        //index of last valid element in the peak array 
        //The number of peaks in the MMR is exactly the number of bits to 1 
        //in the variable that contains the number of leaves of the MMR
        int treePeaksLastIdx = int(countBitsSetToOne(numberOfLeafsInSC - 1));

        //If the countOfHash==0 - The hashed value should be appended without any computation
        //since it is a peak 
        if(countOfHashes == 0){
            updateStorageMMRData(leaf_information, uint(treePeaksLastIdx) );
        }

        //Calculate Root of MMR 
        for(int i= treePeaksLastIdx - 1; i>= 0; i--){                
            //merge MMR nodes
            //Assigments to reduce gas cost variability 
            leaf_information   =  //mergeNodes(tree.peaks[uint(i)], leaf_information ) ;
                 mergeNodesIndex(uint(i), leaf_information);
            
            //once the number of hashes needed to calculate the new peak has been performed
            //insert it in the peaks array
            if(countOfHashes != 0 && (i == (treePeaksLastIdx - int(countOfHashes)) ) )
            {
                //last significant peak stored in the smart contract overwriting the oldest recalculate peak
                updateStorageMMRData( leaf_information, uint(treePeaksLastIdx - int(countOfHashes)) );
            }
        } 


        //NEW ROOT HASH UPDATE: the hash contained in the root is logged instead of the
        //hash of the root itself (save gas)
        bytes32 rootHash = leaf_information.peak;
        emit EventLogRootHash(rootHash);
    }

    /** merge DifficultyNodes as in the MMR definition
        IN:
            - i: peak index of Left MMR node to merge
            - right: Right MMR node to merge
        return leaf: the result of the merge
     */
    function mergeNodesIndex(uint i, BlockNode memory right) private view returns(BlockNode memory left){
         left = tree.peaks[i];
         bytes32 lefthash = keccak256( abi.encode(left));
         bytes32 righthash =  keccak256( abi.encode(right));

         // //set the MMR node peak (field containg the hash) with the calculated hash value
         //leaf_information_merged.peak =  keccak256(abi.encode(left, right));

         left.peak =  keccak256(abi.encode(lefthash, righthash));
         left.timestampLastBlockCoverd =  right.timestampLastBlockCoverd;
         left.difficultyLastBlockCoverd = right.difficultyLastBlockCoverd;
         left.NodeDifficulty += uint128(right.NodeDifficulty);
         left.NumberOfBlocksCoverd += uint128(right.NumberOfBlocksCoverd);

     }

    /**
     calculateNumbOfHash - Calculates the number of hashes that must be performed
     starting from the left of the peaks array. 
     The number of hashes to be perfomed to get the new peaks is
     the number of bits in the numberOfLeafs that changed from 1 to 0 
     (See documentation for further details)
     IN:
        - numberOfLeafs: Number of leaves in the MMR
    return count: number of bits that changed from 1 to 0 by adding one leaf
     */
    function calculateNumbOfHash(uint numberOfLeafs) public pure returns(uint){
        uint numberOfLeafsUpdated = numberOfLeafs + 1;
        uint changedFrom1to0 = numberOfLeafs & (~numberOfLeafsUpdated);
        uint count = countBitsSetToOne(changedFrom1to0);
	    return count;
    }

    /**
        Give as input a variable countBitsSetToOne return the count of the number of bits equal 1 
     */
    function countBitsSetToOne(uint variable) public pure returns(uint){
        uint counterBits1 = 0;
        
        //while the variable has not all the bit set to 0
        while(variable != 0){
            //check if the least significative bit is set to 1
            //if so increase the counterBits1
            if(variable & 1 == 1){
                counterBits1 ++;
            }

            //Shift right the variable to discard the least significant bit (already analyzed)
            variable = variable >> 1;
        }
        return counterBits1;
    }
    
    //////////////  GETTERS: Used only for testing and debugging //////////////////////

    /**
        Get number of leafs
     */
    function getNumberLeafs( ) public view returns (uint){
        return tree.numberOfLeafs;
    }

    /**
        From the number of leafs, get the index of the last significant peak
     */
    function getLastSignificantPeak ( ) public view returns (uint){
        return countBitsSetToOne(tree.numberOfLeafs);
    }

    /**
        Get all the peaks hashs
     */
    function getPeaksHashes( ) public view returns (bytes32[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        bytes32[] memory peaks_array = new bytes32[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            peaks_array[i] = tree.peaks[i].peak;
        }
        return peaks_array;
    } 


    /**
        Get the first time stored in all the peaks (also non significant)
     */    
    function getPeaksFirstTime( ) public view returns (uint64[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint64[] memory time_array = new uint64[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            time_array[i] = tree.peaks[i].timestampFirstBlockCoverd;
        }
        return time_array;
    } 

    /**
        Get the last time stored in all the peaks (also non significant)
     */ 
    function getPeaksLastTime( ) public view returns (uint64[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint64[] memory time_array = new uint64[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            time_array[i] = tree.peaks[i].timestampLastBlockCoverd;
        }
        return time_array;
    }

    /**
        Get the first difficulty stored in all the peaks (also non significant)
     */   
    function getPeaksFirstDifficulty( ) public view returns (uint64[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint64[] memory diff_array = new uint64[]( treePeaksLastIdx ); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            diff_array[i] = tree.peaks[i].difficultyFirstBlockCoverd;
        }
        return diff_array;
    } 

    /**
        Get the last difficulty stored in all the peaks (also non significant)
     */  
    function getPeaksLastDifficulty( ) public view returns (uint64[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint64[] memory diff_array = new uint64[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            diff_array[i] = tree.peaks[i].difficultyLastBlockCoverd;
        }
        return diff_array;
    } 

    /**
        Get the peaks difficulty (the difficuly that they cover)
     */
    function getPeaksNodesDifficulty( ) public view returns (uint128[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint128[] memory diff_array = new uint128[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            diff_array[i] = tree.peaks[i].NodeDifficulty;
        }
        return diff_array;
    } 

    /**
      Get the number of blocks that peaks cover
     */
    function getPeaksNumberOfBlocksCoverd( ) public view returns (uint128[] memory){
        //index of last valid element in the peak array 
        uint treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
        uint128[] memory num_array = new uint128[](treePeaksLastIdx); 
        for(uint i=0; i<treePeaksLastIdx; i++){
            num_array[i] = tree.peaks[i].NumberOfBlocksCoverd;
        }
        return num_array;
    } 

    function getLastBlockNumber( ) public view returns(uint){
        return tree.lastBlockNumber;
    }

    /**
    Utility function to test data extraction from block
    In this case the field 8 is extracted -> Block Number
    */
    function getBlockNumber(bytes memory data_of_blocks) public pure returns (uint){
         RLPItem[] memory blocksData =   toList(  toRlpItem(data_of_blocks));
         RLPItem[] memory singleBlockdata =   toList(blocksData[0]);
        return   toUint(singleBlockdata[8]);  
    }

    ///////////////////////////////////////////////////////////////////////////////////////////

    ///////// RLP encoding and decoding 

    uint8 constant STRING_SHORT_START = 0x80;
    uint8 constant STRING_LONG_START  = 0xb8;
    uint8 constant LIST_SHORT_START   = 0xc0;
    uint8 constant LIST_LONG_START    = 0xf8;
    uint8 constant WORD_SIZE = 32;

    struct RLPItem {
        uint len;
        uint memPtr;
    }

    struct Iterator {
        RLPItem item;   // Item that's being iterated over.
        uint nextPtr;   // Position of the next item in the list.
    }

    /*
    * @param item RLP encoded bytes
    */
    function toRlpItem(bytes memory item) internal pure returns (RLPItem memory) {
        uint memPtr;
        assembly {
            memPtr := add(item, 0x20)
        }

        return RLPItem(item.length, memPtr);
    }

    /*
     * @param the RLP item.
     * @return (memPtr, len) pair: location of the item's payload in memory.
     */
    function payloadLocation(RLPItem memory item) internal pure returns (uint, uint) {
        uint offset = _payloadOffset(item.memPtr);
        uint memPtr = item.memPtr + offset;
        uint len = item.len - offset; // data length
        return (memPtr, len);
    }

    /*
    * @param the RLP item containing the encoded list.
    */
    function toList(RLPItem memory item) internal pure returns (RLPItem[] memory) {
        require(isList(item));

        uint items = numItems(item);
        RLPItem[] memory result = new RLPItem[](items);

        uint memPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint dataLen;
        for (uint i = 0; i < items; i++) {
            dataLen = _itemLength(memPtr);
            result[i] = RLPItem(dataLen, memPtr); 
            memPtr = memPtr + dataLen;
        }

        return result;
    }

    /** Riccardo Xefraj
        Function to get in RLPItem format one single element of a RLPItem composed by multiple objects
     */
    function getRLPElementFromPosition(RLPItem memory item, uint idx) internal pure returns (RLPItem memory){
        require(isList(item));

        uint items = numItems(item);
       
       require(items >= idx, "ERROR: Idx passed as parameter is invalid");
       
        RLPItem memory result;

        uint memPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint dataLen;
        for (uint i = 0; i <= idx; i++) {
            dataLen = _itemLength(memPtr);
            if(i == idx ){
                result = RLPItem(dataLen, memPtr);
            } 
            memPtr = memPtr + dataLen;
        }

        return result;

    }

    // @return indicator whether encoded payload is a list. negate this function call for isData.
    function isList(RLPItem memory item) internal pure returns (bool) {
        if (item.len == 0) return false;

        uint8 byte0;
        uint memPtr = item.memPtr;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < LIST_SHORT_START)
            return false;
        return true;
    }

    /*
     * @dev A cheaper version of keccak256(toRlpBytes(item)) that avoids copying memory.
     * @return keccak256 hash of RLP encoded bytes.
     */
    function rlpBytesKeccak256(RLPItem memory item) internal pure returns (bytes32) {
        uint256 ptr = item.memPtr;
        uint256 len = item.len;
        bytes32 result;
        assembly {
            result := keccak256(ptr, len)
        }
        return result;
    }

    /*
     * @dev A cheaper version of keccak256(toBytes(item)) that avoids copying memory.
     * @return keccak256 hash of the item payload.
     */
    function payloadKeccak256(RLPItem memory item) internal pure returns (bytes32) {
        (uint memPtr, uint len) = payloadLocation(item);
        bytes32 result;
        assembly {
            result := keccak256(memPtr, len)
        }
        return result;
    }

    /** RLPItem conversions into data types **/

    // RX: Needed if we want to avoid ABIEncoderV2
    // @returns raw rlp encoding in bytes
    //function toRlpBytes(RLPItem memory item) internal pure returns (bytes memory) {
    //    bytes memory result = new bytes(item.len);
    //    if (result.length == 0) return result;
        
    //    uint ptr;
    //    assembly {
    //        ptr := add(0x20, result)
    //    }

    //    copy(item.memPtr, ptr, item.len);
    //    return result;
    //}

    // any non-zero byte except "0x80" is considered true
    //function toBoolean(RLPItem memory item) internal pure returns (bool) {
    //   require(item.len == 1);
    //    uint result;
    //    uint memPtr = item.memPtr;
    //    assembly {
    //        result := byte(0, mload(memPtr))
    //    }

        // SEE Github Issue #5.
        // Summary: Most commonly used RLP libraries (i.e Geth) will encode
        // "0" as "0x80" instead of as "0". We handle this edge case explicitly
        // here.
    //    if (result == 0 || result == STRING_SHORT_START) {
    //        return false;
    //    } else {
    //        return true;
    //    }
    //}

    //function toAddress(RLPItem memory item) internal pure returns (address) {
        // 1 byte for the length prefix
    //    require(item.len == 21);

    //    return address(toUint(item));
    //}

    function toUint(RLPItem memory item) internal pure returns (uint) {
        require(item.len > 0 && item.len <= 33);

        (uint memPtr, uint len) = payloadLocation(item);

        uint result;
        assembly {
            result := mload(memPtr)

            // shfit to the correct location if neccesary
            if lt(len, 32) {
                result := div(result, exp(256, sub(32, len)))
            }
        }

        return result;
    }

    // enforces 32 byte length
    //function toUintStrict(RLPItem memory item) internal pure returns (uint) {
    //   // one byte prefix
    //    require(item.len == 33);

    //    uint result;
    //    uint memPtr = item.memPtr + 1;
    //    assembly {
    //        result := mload(memPtr)
    //    }

    //    return result;
    //}

    // RX: Needed if we want to avoid ABIEncoderV2
    //function toBytes(RLPItem memory item) internal pure returns (bytes memory) {
    //    require(item.len > 0);
    //
    //    (uint memPtr, uint len) = payloadLocation(item);
    //    bytes memory result = new bytes(len);

    //    uint destPtr;
    //    assembly {
    //        destPtr := add(0x20, result)
    //    }

    //    copy(memPtr, destPtr, len);
    //    return result;
    //}

    /*
    * Private Helpers
    */

    // @return number of payload items inside an encoded list.
    function numItems(RLPItem memory item) private pure returns (uint) {
        if (item.len == 0) return 0;

        uint count = 0;
        uint currPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint endPtr = item.memPtr + item.len;
        while (currPtr < endPtr) {
           currPtr = currPtr + _itemLength(currPtr); // skip over an item
           count++;
        }

        return count;
    }

    // @return entire rlp item byte length
    function _itemLength(uint memPtr) private pure returns (uint) {
        uint itemLen;
        uint byte0;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < STRING_SHORT_START)
            itemLen = 1;
        
        else if (byte0 < STRING_LONG_START)
            itemLen = byte0 - STRING_SHORT_START + 1;

        else if (byte0 < LIST_SHORT_START) {
            assembly {
                let byteLen := sub(byte0, 0xb7) // # of bytes the actual length is
                memPtr := add(memPtr, 1) // skip over the first byte
                
                /* 32 byte word size */
                let dataLen := div(mload(memPtr), exp(256, sub(32, byteLen))) // right shifting to get the len
                itemLen := add(dataLen, add(byteLen, 1))
            }
        }

        else if (byte0 < LIST_LONG_START) {
            itemLen = byte0 - LIST_SHORT_START + 1;
        } 

        else {
            assembly {
                let byteLen := sub(byte0, 0xf7)
                memPtr := add(memPtr, 1)

                let dataLen := div(mload(memPtr), exp(256, sub(32, byteLen))) // right shifting to the correct length
                itemLen := add(dataLen, add(byteLen, 1))
            }
        }

        return itemLen;
    }

    // @return number of bytes until the data
    function _payloadOffset(uint memPtr) private pure returns (uint) {
        uint byte0;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < STRING_SHORT_START) 
            return 0;
        else if (byte0 < STRING_LONG_START || (byte0 >= LIST_SHORT_START && byte0 < LIST_LONG_START))
            return 1;
        else if (byte0 < LIST_SHORT_START)  // being explicit
            return byte0 - (STRING_LONG_START - 1) + 1;
        else
            return byte0 - (LIST_LONG_START - 1) + 1;
    }

    /*
    * @param src Pointer to source
    * @param dest Pointer to destination
    * @param len Amount of memory to copy from the source
    */
    function copy(uint src, uint dest, uint len) private pure {
        if (len == 0) return;

        // copy as many word sizes as possible
        for (; len >= WORD_SIZE; len -= WORD_SIZE) {
            assembly {
                mstore(dest, mload(src))
            }

            src += WORD_SIZE;
            dest += WORD_SIZE;
        }

        if (len > 0) {
            // left over bytes. Mask is used to remove unwanted bytes from the word
            uint mask = 256 ** (WORD_SIZE - len) - 1;
            assembly {
                let srcpart := and(mload(src), not(mask)) // zero out src
                let destpart := and(mload(dest), mask) // retrieve the bytes
                mstore(dest, or(destpart, srcpart))
            }
        }
    }
}