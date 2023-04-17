//libraries required 
const Web3 = require('web3');
//the web3 provider is used only to calculate the hash
//so no connection is required to a provider but by
//default one provider must be set
const web3 = new Web3('http://127.0.0.1:7100');

class DifficultyNode {

    /**
     * 
     * @param {*} JSONDNode JSON format of a DifficultyNode - if not provided 
     * a dummy Difficulty Node is created
     */
    constructor(JSONDNode = {
        peak: "0xf6a1b2e3501f269e6acbd476ab5a1702679cdd29be4bc7cc9bc9031f90105ad5",
        tFirstBlock: 1,
        tLastBlock: 1,
        dFirstBlock: 1,
        dLastBlock: 1,
        nodeDifficulty: 1,
        numberOfBlocksCoverd: 1
    } ){
        this.peak = JSONDNode.peak;
        this.tFirstBlock = JSONDNode.tFirstBlock;
        this.tLastBlock = JSONDNode.tLastBlock;
        this.dFirstBlock = JSONDNode.dFirstBlock;
        this.dLastBlock = JSONDNode.dLastBlock;
        this.nodeDifficulty = JSONDNode.nodeDifficulty;
        this.numberOfBlocksCoverd = JSONDNode.nodeDifficulty;
    }

    /**
     * Set values for the DifficultyNode
     * @param {*} peak - hash stored in the DifficultyNode
     * @param {*} tFirstBlock - Timestamp of first block covered by the DifficultyNode
     * @param {*} tLastBlock - Timestamp of last block covered by the DifficultyNode
     * @param {*} dFirstBlock - Difficulty of the first block covered by the DifficultyNode
     * @param {*} dLastBlock  - Difficulty of the last block covered by the DifficultyNode
     * @param {*} nodeDifficulty - Difficulty of blocks covered by the DifficultyNode
     * @param {*} numberOfBlocksCoverd - Number of blocks covered by the DifficultyNode
     */
    setValues(peak, tFirstBlock, tLastBlock, dFirstBlock, dLastBlock, nodeDifficulty, numberOfBlocksCoverd){
        this.peak = peak;
        this.tFirstBlock = tFirstBlock
        this.tLastBlock = tLastBlock
        this.dFirstBlock = dFirstBlock
        this.dLastBlock = dLastBlock
        this.nodeDifficulty = nodeDifficulty
        this.numberOfBlocksCoverd = numberOfBlocksCoverd
    }

    /**
     * Merge two leaf in a single leaf
     * @param {*} nodeRight DifficultyNode to merge 
     * @returns a DifficultyNode that merges the current DifficultyNode 
     * and the nodeRight DifficultyNode 
     */
    mergeNodes(nodeRight){
        let mergedLeaf = new DifficultyNode();
        //Tested 
        var encoded = web3.eth.abi.encodeParameters(
                ['bytes32', 
                 'bytes32'],            
                [//left node
                 this.getKeccak256(),
                 //right node
                 nodeRight.getKeccak256()
                ]
            )
        
        //get the same hash that the SC performs 
        var hash = web3.utils.keccak256(encoded);//web3.utils.sha3(this.getKeccak256() + nodeRight.getKeccak256())
    
        //create merge node
        mergedLeaf.peak = hash;
        mergedLeaf.tFirstBlock = this.tFirstBlock;
        mergedLeaf.tLastBlock =  nodeRight.tLastBlock;
        mergedLeaf.dFirstBlock = this.dFirstBlock;
        mergedLeaf.dLastBlock = nodeRight.dLastBlock;
        mergedLeaf.nodeDifficulty = this.nodeDifficulty  + nodeRight.nodeDifficulty;
        mergedLeaf.numberOfBlocksCoverd = this.numberOfBlocksCoverd  + nodeRight.numberOfBlocksCoverd;
        
        //return the merged node
        return mergedLeaf;
    }

    /**
     * 
     * @returns get the Node difficulty
     */
    getNodeDifficulty(){
        return this.nodeDifficulty;
    }

    /**
     * 
     * @returns the number of blocks covered by the DifficultyNode
     */
    getNumberOfBlocksCoverd(){
        return this.numberOfBlocksCoverd;
    }
    
    /**
     * 
     * @param {*} LeftValue - Left Difficulty Node 
     * @param {*} RigthValue - Right Difficulty Node
     * @returns sha3 hash of two nodes
     */
    getEthereumHash(LeftValue, RightValue = "0x"){    
        return web3.utils.soliditySha3(LeftValue, RightValue)
    }

    /**
     * 
     * @returns single node hashed as the SC does
     */
    getKeccak256(){
        //console.log(this)
        var encoded = web3.eth.abi.encodeParameters(
            ['bytes32', 'uint64', 'uint64', 'uint64', 'uint64', 'uint128', 'uint128' ],
            [this.peak , this.tFirstBlock, this.tLastBlock,
                (this.dFirstBlock == '0' ? 0 : this.dFirstBlock ),
                (this.dLastBlock == '0'  ? 0 : this.dLastBlock ),
                this.nodeDifficulty, this.numberOfBlocksCoverd]
            )
        var hash = web3.utils.keccak256(encoded)
        //console.log(hash)
        return hash;
    }

    /**
     * Returns MMR node in tuple version
     * @returns 
     */
    toTuple(){
        return [this.peak, this.tFirstBlock, this.tLastBlock, this.dFirstBlock, this.dLastBlock, this.nodeDifficulty, this.numberOfBlocksCoverd]
    }

    fromArrayToMMRNode(tuple){
        this.peak = tuple[0];
        this.tFirstBlock = parseInt(tuple[1]);
        this.tLastBlock = parseInt(tuple[2]);
        this.dFirstBlock = parseInt(tuple[3]);
        this.dLastBlock = parseInt(tuple[4]);
        this.nodeDifficulty = parseInt(tuple[5]);
        this.numberOfBlocksCoverd = parseInt(tuple[6]);
    }
}

module.exports = DifficultyNode