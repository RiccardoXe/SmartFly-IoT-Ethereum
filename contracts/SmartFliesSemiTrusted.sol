pragma solidity >=0.4.25 <0.7.0;
//Default feature since pragma 0.8.0 in solidty
pragma experimental ABIEncoderV2;

//Import for rlp encode/decode - used to check information validity


/**
 * @author Riccardo Xefraj
 * @title Merkle Mountain Range Light - peaks only solidity library
 *
 * @dev The index of this MMR implementation starts from 1 not 0.
 *      And it uses keccak256 for its hash function
 */

contract SmartFliesSemiTrusted{
    
    //event to log the MMR Root data in the invocation Receipt
    event EventLogRootHash(bytes32 rootHash);

    struct BlockNode {
        //this is the hash value of a subtree 
        bytes32 peak; 
        //first and last timestamp
        uint64 timestampFirstBlockCoverd;
        uint64 timestampLastBlockCoverd;
        //first an last difficuly transitions of blocks [Small?]
        uint64 difficultyFirstBlockCoverd;
        uint64 difficultyLastBlockCoverd;
        //number of blocks covered (is possible to have this value from numberOfLeaf before and after SC update)
        //but the proof must be provvided form storage
        uint128 NodeDifficulty;
        uint128 NumberOfBlocksCoverd; //[Too big?]
    }

    struct Tree {
        //numberOfLeafs: number of Leafs in the Tree
        uint128 numberOfLeafs;
        //lastBlockNumber: Index of last Block given as input to the smart contact
        uint64 lastBlockNumber;
        //blockWithLastUpdate: the block index that contains SC call
        uint64 blockWithLastUpdate;
        //peaks: map containg the peaks 
        mapping(uint => BlockNode) peaks;
    }

    //Tree in storage
    Tree tree;
    
    //owner of the smart contract
    address owner;
    //partialy-trusted updaters
    mapping(address=>bool) updaters ;

    //////////////////////////////// UPDATERS MANAGEMENT /////////////////////////////////
    /**
        Set the owner to the owner to the msg sender
     */
     constructor() public {
         owner = msg.sender;
     }

    /**
        Add an updater to the smart contract, only the owner can perform this action
     */
    function addUpdater(address updaterAddress) public{
        require(msg.sender == owner, "[ERROR OWNER ONLY]: Only the owner can add an updater");
        updaters[updaterAddress] = true;
    }

    /** 
        Remove an updater from the smart contract, only the owner can perform this action
     */
    function removeUpdater(address updaterAddress) public {
        require(msg.sender == owner, "[ERROR OWNER ONLY]: Only the owner can remove an updater");
        updaters[updaterAddress] = false;
    }

    /**
        Check if an updater exists
     */
     function checkIfUpdaterExist(address updaterAddress) public view returns (bool) {
        return updaters[updaterAddress];
     }
    ////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////// DIFFICULTY CALCULATIONS ////////////////////////////////

    
    /**
    Difficulty formula for ETC.
        Given the parent difficulty and the current block time
        returns the calculated difficulty for the block
     */
    function getBlockDifficulty(uint64 parentDifficulty, uint64 BlockTime) public pure returns (uint64){
        int128 currentDifficulty = 0;
        int64 maxElement = 1 - int64(BlockTime/10);
        if(maxElement < -99){
            maxElement = -99;
        }
        //Difficulty formula
        currentDifficulty =  int128(parentDifficulty) +
             (int128(parentDifficulty)/2048)*maxElement;
        return uint64(currentDifficulty);
    }    

    /**
    Inverse difficulty formula for ETC (approximated).
        Given the current difficulty and the current block time
        returns the calculated difficulty for the previous block.
     */
    function getInverseDifficulty(uint64 currentDifficulty, uint64 BlockTime) 
    public pure returns (uint64){
        int128 previousDifficulty = 0;
        int64 maxElement = 1 - int64(BlockTime/10);
        if(maxElement<-99){
            maxElement = -99;
        }

        //Inverse difficulty formula
        previousDifficulty = 
            (2048/(2048+maxElement))*(int128(currentDifficulty));

        return uint64(previousDifficulty);
    }

    /**
    Calculate maximum total node difficulty given the starting difficulty,
    the ending difficulty and the number of blocks covers.

    The function has two phases:
    1) Maximum increasing phase
    2) Minimum decreasing phase
     */
    function getMaximumDifficultyTransitionsBunzLike(
        uint64 Dleft,
        uint64 Dright,
        uint128 Nremaining
    ) public pure returns (uint128)
    {
        uint64 time_min = 1;
        uint64 time_max = 1000;
        
        uint128 Dtot_left = Dleft;
        uint128 Dtot_right = 0;

        //Maximum increasing phase
        for(int i=1; i!=Nremaining; i++){
            Dleft = getBlockDifficulty(Dleft, time_min);
            Dtot_left = Dtot_left + Dleft;
        }
        
        require(Dleft>=Dright,
                "[Impossible Difficulty Transitions] the ending difficulty is bigger that the maximum possible");
        
        //Minimum decreasing phase
        //TODO: Uncomment condition
        while(Nremaining!=0 /*&& Dleft>Dright*/){
            Dtot_right = Dtot_right + Dright;
            
            Dleft = getInverseDifficulty(Dleft, time_min);
            Dtot_left = Dtot_left - Dleft;

            Dright = getInverseDifficulty(Dright, time_max);

            Nremaining -=1;
        }
        //require(Nremaining != 0 || Dleft<=Dright, 
        //        "[Impossible Difficulty Transition] minimum decreasing not possible");

        return uint128(Dtot_left+Dtot_right);
    }


    ////////////////////////////////////////////////////////////////////////////////////

    /**
        The store function check the MMR leaf validity and then append it to the MMR
        IN:
            leaf_information: MMR leaf to add
            first_block_number: First block coverd by the MMR leaf (used for validity checks)
     */
    function store(bytes calldata firstBlockBytes, bytes calldata lastBlockBytes, uint128 nodeDifficulty) external{
        //Check if the msg sender is the owner of the SC or one of the updaters
        require(msg.sender == owner || updaters[msg.sender] == true,
             "[Not Owner or updater] Only the owner and the updaters of the SC can append leaves to the MMR");

        //set to default 1 and then modified in the code
        uint64 blocksCovered = 1;
        uint64 startingDifficulty;
        uint64 endingDifficulty;
        uint64 lastBlockNumberInput;
        bytes32 inputBlockHash;
        BlockNode memory leaf; 

        RLPItem memory firstBlock = toRlpItem(firstBlockBytes); 
        RLPItem memory lastBlock;
        
        //Check input blocks validity - (in case of error we can remove the sender from the trusted ones)
        {  
            //info about input blocks
            uint64 firstBlockNumberInput = uint64( toUint( getRLPElementFromPosition( firstBlock, 8) ) );
            startingDifficulty = uint64( toUint( getRLPElementFromPosition( firstBlock, 7) ) );


            //If not in the scenario 1 block per MMR leaf
            if(lastBlockBytes.length != 0){
                lastBlock = toRlpItem(lastBlockBytes);
                lastBlockNumberInput =  uint64( toUint( getRLPElementFromPosition( lastBlock, 8) ) );
                endingDifficulty = uint64( toUint( getRLPElementFromPosition( lastBlock, 7) ) );
                //Check input blocks are in the correct order
                require(lastBlockNumberInput >= firstBlockNumberInput,
                    "[Input blocks incorrect order] The first block index must be smaller that the last block index");
            } else{
                lastBlockNumberInput = firstBlockNumberInput;
                endingDifficulty = startingDifficulty;
            }

            //info about blocks in SC
            uint64 lastBlockNumberInSC = tree.lastBlockNumber;
            uint64 blockWithLastUpdateSC = tree.blockWithLastUpdate;

            //Check that there are no missing blocks 
            require(firstBlockNumberInput == lastBlockNumberInSC + 1 || lastBlockNumberInSC == 0,
                    "[Blocks skipped]: Input block index different from next block index required by smart contract ");
            
            //Check that in the range of input blocks there is the previous MMR invocation
            require(blockWithLastUpdateSC <= lastBlockNumberInput || blockWithLastUpdateSC == 0,
                    "[No old SC invocation in blocks]: Since the block is not a genesis block an old SC invocation must be present");

            //Validate blocks with chain seen by SC
            bytes32 blockHashChain = blockhash(firstBlockNumberInput);
            inputBlockHash = rlpBytesKeccak256(firstBlock);
            
            require(blockHashChain == inputBlockHash,
                    "[First input block not matching] The first input block hash is not equal to the on seen by SC");

            //If not in the scenario 1 block per MMR leaf
            if(lastBlockBytes.length != 0){
                blockHashChain = blockhash(lastBlockNumberInput);
                inputBlockHash = rlpBytesKeccak256(lastBlock);

                require(blockHashChain == inputBlockHash,
                        "[Last input block not matching] The last input block hash is not equal to the on seen by SC");

                //Check if node Difficulty is plausible
                blocksCovered = lastBlockNumberInput - firstBlockNumberInput + 1;

                uint128 maxDifficultyForNode = getMaximumDifficultyTransitionsBunzLike(startingDifficulty, endingDifficulty, blocksCovered);
                require(nodeDifficulty <= maxDifficultyForNode,
                        "[Node difficulty not plausible] The node difficulty is bigger than the maximum plausible");
            }
        }

        //Create MMR leaf
        {
            leaf.peak = inputBlockHash; 
            leaf.timestampFirstBlockCoverd = uint64( toUint( getRLPElementFromPosition( firstBlock, 11) ) );
            leaf.timestampLastBlockCoverd = uint64( toUint( getRLPElementFromPosition( lastBlock, 11) ) );
            leaf.difficultyFirstBlockCoverd = startingDifficulty;
            leaf.difficultyLastBlockCoverd = endingDifficulty;
            leaf.NodeDifficulty= nodeDifficulty;
            leaf.NumberOfBlocksCoverd = blocksCovered; 
        }
        //update the SC status
        updateStorageTreeData(lastBlockNumberInput);
        //update the MMR 
        calculatePeaksAndRoot(leaf);
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
     */
    function updateStorageMMRData(BlockNode memory leaf_information, uint treePeaksLastIdx) public{
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
     * calculateNumbOfHash - Calculates the number of hashes that must be performed
     * starting from the left of the peaks array 
     * The number of hashes to be perfomed to get the new peaks is
     * the number of bits in the numberOfLeafs that changed from 1 to 0 
     * (See documentation for further details)
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
    
    // ************************************** GETTERS ***********************************
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

    // /**
    // Utility function to test data extraction from block
    // In this case the field 8 is extracted -> Block Number
    // */
    // function getBlockNumber(bytes memory data_of_blocks) public pure returns (uint){
    //      RLPItem[] memory blocksData =   toList(  toRlpItem(data_of_blocks));
    //      RLPItem[] memory singleBlockdata =   toList(blocksData[0]);
    //     return   toUint(singleBlockdata[8]);  
    // }

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