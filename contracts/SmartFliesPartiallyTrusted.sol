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

contract SmartFliesPartiallyTrusted{
    
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
    
    //block difficulty creation - avoids that an adversary can start from an arbitrary difficulty
    //uint64 genesisDifficulty;
    //uint64 genesisTimestamp;

    //owner of the smart contract
    address owner;
    //partialy-trusted updaters
    mapping(address=>bool) updaters ;

    //Difficulty Bomb removed in ETC from ECIP 1041
    //uint64 EIPOffset = 11400000;

    //////////////////////////////// UPDATERS MANAGEMENT /////////////////////////////////
    /**
        Set the owner to the owner to the msg sender
     */
     constructor() public {
         owner = msg.sender;
         //genesisDifficulty = uint64(block.difficulty);
         //genesisTimestamp = uint64(block.timestamp);
         //tree.lastBlockNumber = uint64(block.number);
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
    Given the parent difficulty, the current block time, the current block number
    return the calculated difficulty for the block
    NOTE: The BlockNumber is needed only if there is the difficulty bomb in the formula
     */
    // function getBlockDifficulty(uint64 parentDifficulty, uint64 BlockTime/*, uint64 BlockNumber*/) public pure returns (uint64){
    //     int128 currentDifficulty = 0;
    //     int64 maxElement = 1 - int64(BlockTime/10);
    //     if(maxElement < -99){
    //         maxElement = -99;
    //     }

    //     //Difficulty formula
    //     currentDifficulty =  int128(parentDifficulty) +
    //          (int128(parentDifficulty)/2048)*maxElement;

    //     return uint64(currentDifficulty);
    // }    

    ////////////////////////////////////////////////////////////////////////////////////

    /**
        The store function check the MMR leaf validity and then append it to the MMR
        IN:
            leaf_information: MMR leaf to add
            first_block_number: First block coverd by the MMR leaf (used for validity checks) (OPTIONAL CAN BE REMOVED)
     */
    function store(BlockNode calldata leaf_information, uint64 first_block_number) external{
        //Check if the msg sender is the owner of the SC or one of the updaters
        require(msg.sender == owner || updaters[msg.sender] == true,
             "[Not Owner or updater] Only the owner and the updaters of the SC can append leaves to the MMR");

        //uint64 lastBlockNumberInSC = tree.lastBlockNumber;
        //uint64 blockWithLastUpdateSC = tree.blockWithLastUpdate;
        
        //Check if the first block number provvided is continuous
        //require(lastBlockNumberInSC + 1 == first_block_number,
        //        "[Blocks skipped]: Input block index different from next block index required by smart contract ");
        
    
        //TODO ?: Limit the adversary number of blocks per leaf
        //Get the last block number given the first one and the number of blocks - DANGEROUS: TRUSTED SCENARIO
        uint64 lastInputBlockNumber = uint64( first_block_number +  leaf_information.NumberOfBlocksCoverd - 1);

        //Check if there is an old SC invocation in the blocks given as input - if not genesis block
        //require(blockWithLastUpdateSC <= lastInputBlockNumber,
        //        "[No old SC invocation in blocks]: Since the block is not a genesis block an old SC invocation must be present");
        
        //Check MMR Leaf validity
        //Only signficative check in Trusted Scenario - validate leaf structure and basic info
        //checkNodeValidity(leaf_information, lastInputBlockNumber, lastBlockNumberInSC);
        //// HERE OK - CHecks missing updates
        //update the SC status
        updateStorageTreeData(lastInputBlockNumber);
        //update the MMR 
        calculatePeaksAndRoot(leaf_information);
    }

    /**
        Check if provided hash is correct, difficulty transitions are continuous for last and current block,
        difficulty transitions are possible.
     */
    // function checkNodeValidity(BlockNode memory leaf_information, uint64 lastInputBlockNumber, uint64 blockWithLastUpdateSC)
    //  public view {
    //     //Check that leaf has correct information - leaf hash value correct - leaf time positive - blocks covered positive
    //     {
    //         // Check that the hash value in the leaf is the same seen in the chain 
    //         bytes32 lastBlockHash = blockhash(lastInputBlockNumber);
    //         require(leaf_information.peak == lastBlockHash, 
    //             "[ERROR HASH IN LEAF] The hash value store in the leaf doesn't correspond to the one seen by the SC");
    //         //check that the leaf covers at least 1 block
    //         require(leaf_information.NumberOfBlocksCoverd > 0,
    //                 "[ERROR LEAF BLOCKS COVERD] At least one block should be coverd by the leaf");

    //         //check that the leaf time is possible (>= 1 second per block covered)
    //         int time = int(leaf_information.timestampLastBlockCoverd) - int(leaf_information.timestampFirstBlockCoverd);
    //         //TODO: uncomment comment condition in real deploy
    //         require(leaf_information.NumberOfBlocksCoverd == 1 || time >= time /*(leaf_information.NumberOfBlocksCoverd - 1*/,
    //                 "[ERROR LEAF TIME] Some block time is less then 1 second");

    //         //Check genesis
    //         if(blockWithLastUpdateSC == 0){
    //             require(leaf_information.difficultyFirstBlockCoverd == genesisDifficulty,
    //                 "[ERROR GENESIS] the genesis leaf difficulty is wrong" );
    //         }
    //     }

    //     // Check continuity of the previous MMR node and current input leaf
    //     {
    //         uint treePeaksLastIdx;
    //         uint64 BlockTime; 
    //         uint64 difficultyCalculated;
    //         BlockNode memory previous_node;
    //         //If the MMR node is not the gensis one perform the checks
    //         if(blockWithLastUpdateSC !=0){
    //             //get the last significant leaf (it contains the Difficulty and timestamp of the last block)
    //             treePeaksLastIdx = countBitsSetToOne(tree.numberOfLeafs);
    //             //Get the last peak of the MMR
    //             previous_node = tree.peaks[treePeaksLastIdx];
    //             //calculate the block time between the last covered block by the MMR and the first coverd block of the leaf
    //             //TODO: remove = in final deploy
    //             require(leaf_information.timestampFirstBlockCoverd >= previous_node.timestampLastBlockCoverd,
    //                 "[ERROR INCORRECT TIMESTAMP] The new MMR leaf starting timestamp should be bigger than the timestamp in the previous MMR leaf");
    //             BlockTime = leaf_information.timestampFirstBlockCoverd - previous_node.timestampLastBlockCoverd; 
    //             //Calculate exact difficulty transition
    //             difficultyCalculated = getBlockDifficulty(previous_node.difficultyLastBlockCoverd, BlockTime);
    //             //the declared difficulty transition and the currently declared one should be equal
                
    //             //TODO: Uncomment real check and delete testing check 
    //             ////// REAL CHECK
    //             //require(difficultyCalculated == leaf_information.difficultyFirstBlockCoverd, 
    //             //////
    //             ////// TESTING CHECK (for gas analysis)
    //             require(difficultyCalculated == difficultyCalculated, 
    //                 "[ERROR LEAF INCORRECT STARTING DIFFICULTY] the provvided starting difficulty is not correct");
    //             //////
    //         } else{ //check continuity with genesis
    //             BlockTime = leaf_information.timestampFirstBlockCoverd - genesisTimestamp;
    //             difficultyCalculated = getBlockDifficulty(genesisDifficulty, BlockTime);
    //             //require(diffcultyCalculated == difficultyFirstBlockCoverd, 
    //              require(difficultyCalculated == difficultyCalculated, 
    //                 "[ERROR LEAF INCORRECT STARTING DIFFICULTY] the provvided starting difficulty is not correct (genesis)");
    //         }
    //     }
        
    //     // Check that the difficulty transitions are possible
    //     {
    //         uint64 time_min = 1;
    //         uint64 Dleft= leaf_information.difficultyFirstBlockCoverd;
    //         uint64 Dright = leaf_information.difficultyLastBlockCoverd;

    //         uint128 Dtot_declared = leaf_information.NodeDifficulty;
    //         uint128 Dtot_max = Dleft;
    //         uint128 Nremaining =  leaf_information.NumberOfBlocksCoverd;

    //         //Maximum increasing phase
    //         for(int i=1; i!=Nremaining; i++){
    //             Dleft = getBlockDifficulty(Dleft, time_min);
    //             Dtot_max = Dtot_max + Dleft;
    //         }

    //         //TODO: Uncomment this in real scenario
    //         require(Dleft >= Dright /*&& Dtot_max >= Dtot_declared*/,
    //             "[ERROR DIFFICULTY] Declared leaf difficulty not possible");
    //     }
    // }

    /**
        + Update the SC status by increasing the number of leaves by one, 
        + The last block number seen by the tree is set to the last block given as input by 
         the SC
        + The current block number saved (block that contain the SC invocation)
     */
    function updateStorageTreeData(uint64 lastInputBlockNumber) private{
        // Write in storage - should be a single SStore
        //Update the number of leaves
        tree.numberOfLeafs = tree.numberOfLeafs + 1;
        //Store the last block seen by the SC
        tree.lastBlockNumber = lastInputBlockNumber;
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
                //NEW MAP UPDATE + NEW COMPILER OPTIMIZATION UPDATE
                updateStorageMMRData( leaf_information, uint(treePeaksLastIdx - int(countOfHashes)) );
                   // tree.peaks[uint(treePeaksLastIdx - int(countOfHashes))] = leaf_information;
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

}