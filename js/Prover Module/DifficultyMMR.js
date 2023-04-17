//POSSIBLE IMPROVEMENTS:
// + Delete a leaf functinality 

//libraries required 
const DifficultyNode = require('./DifficultyNode')


class DifficultyMMRTree{
    constructor( tree, leafInfoArray = [], levels_odd_elements = []){
        //this is a utility array that can be used to store additional information
        //in this case to each leaf is associated the cumulative difficulty of all
        //the leaves until that point useful for easier retrieval  
        this.leafInfoArray = leafInfoArray;
        //this.tree is array of arrays
        //each array corresponds to a level of MMR tree 
        //and is composed by Difficulty Nodes
        // this.tree[0] - contains the leafs
        this.tree = tree;
        //The levels_odd_elements is an array that contains 
        //the information of the levels of the MMR having an
        //an odd number of DifficultyNodes
        this.levels_odd_elements = levels_odd_elements;
    }

    // ********************** GET TREE INFORMATION **********************************

    /**
     * 
     * @returns  the tree as array of arrays
     */
    getTree(){
        return this.tree;
    }

    /**
     * 
     * @returns the index of the last Leaf in the tree
     */
    getLastLeafIndex(){
        return this.tree[0].length - 1
    }

    /**
     * 
     * @returns the array containing the levels with an odd number of elements
     */
    getLevelOddElements(){
        return this.levels_odd_elements;
    }

    /**
     * @param {Hashed value of the data of which we want the index} hashed_value 
     * @returns index of the leaf in the tree
     */
     getLeafIndex(hashed_value){
        for(var i = 0; i < this.tree[0].length; i++){
            if(this.tree[0][i].getPeak() == hashed_value)
                return i;
        }
        return -1;
    }


    /**
     * 
     * @param {*} index - index of the node of which the caller wants the value 
     * @param {*} level - level of tree of which the caller wants the node 
     * @returns value of the node with index "index" on the level "level"
     */
    getNodeValue(index, level = 0){
        return this.tree[level][index]
    }

    /**
     * 
     * @returns the root of the tree
     */
    getRoot(){
        let levels = this.tree.length - 1;
       // console.log(this.tree[0][0] instanceof DifficultyNode)
        return this.tree[levels][0]; 
    }

    /**
     * 
     * @returns the number of Nodes at each level
     */
    getNumberOfNodesEachLevel(){
        let number_of_nodes_each_level = []
        for(let i=0; i < this.tree.length; i++){
            number_of_nodes_each_level.push(this.tree[i].length)
        }
        return number_of_nodes_each_level;
    }

    /**
     * 
     * @returns All the BlockNodes composing the leaves of the tree
     */
     getLeafArray(){
        return this.tree[0];
    }

    /**
     * NOT USED SINCE NOW THE DIFFICULTY MMR IS INDEPENDENT 
     * FROM THE NODES IT CONTAINS (THE DIFFICULTY NODE MUST ADDRESS
     * THE MERGING RULES)
     * @param {*} LeftValue left value to hash
     * @param {*} RigthValue right value to hash
     * @returns hash of the input values with soliditySha3
     */
    //getEthereumHash(LeftValue, RightValue = "0x"){
    //    return web3.utils.soliditySha3(LeftValue, RightValue)
    //}  
    
    /**
     * OPTIONAL OPTIMIZATION - Can we remove some information from this?
     * @param {*} relativeDifficulty value that goes from 0 to 1
     * @returns DifficultyNode associated with specific value in format
     *  {leafHashValue: The DifficultyNode value; leafDifficulty: difficulty of the leaf, leafIdx: index leaf in tree }
     */
    getLeafFromDifficulty(relativeDifficulty){
        //get last element of the leafInfoArray
        if(this.leafInfoArray[this.leafInfoArray.length - 1] != undefined){
            //get total difficulty from the leafInfoArray
            var totalDifficulty = this.leafInfoArray[this.leafInfoArray.length - 1];
            //the requested difficulty is set as the floor of the total difficulty
            //multiplied by the relative difficulty
            var requestedDifficulty = Math.floor(totalDifficulty * relativeDifficulty);

            //find the index that is closer to the requested Difficulty
            var indexOfElement = this.binarySearchClosest(this.leafInfoArray, requestedDifficulty);
            //return the lead index
            return indexOfElement;
        }
        return null;
    }

    /**
     * 
     * @param {*} indexOfElement index of leaf element to retrieve
     * @returns NodeDifficulty of the specified leaf in format
     * {leafHashValue: fullNode info, leafDifficulty: difficulty of Leaf, leafIdx: }
     */
    getLeafFromIdx(indexOfElement){
        if(this.leafInfoArray[indexOfElement] != undefined){
            return {leafHashValue: this.tree[0][indexOfElement], leafDifficulty: this.leafInfoArray[indexOfElement], leafIdx: indexOfElement}
        }
        return {leafHashValue: null, leafDifficulty: null, leafIdx: null};
    }

    // ***********************************************************************************
    
    // ********************************* INSERTION ROUTINE *******************************
    
    /**
     * the cleaningRoutine deletes all the provisory nodes 
     * With provisory nodes we mean all the nodes that must be re calculated when 
     * a new leaf is added to the tree
     */
    cleaningRoutine(){
        //height of the tree
        let number_of_levels = this.tree.length - 1;
        if(this.levels_odd_elements[this.levels_odd_elements.length - 1] == this.tree.length - 2){
            let last_element = this.tree[number_of_levels].length - 1;
            this.tree[number_of_levels].splice(last_element, 1)
            //delete the empty array
            this.tree.splice(number_of_levels, 1)
        }
        for(let i=this.levels_odd_elements.length -1; i >= 0; i--){
            //since the leaf created from odd levels is positioned on the next first level that has
            // an odd number of nodes we must delete it too. If exists delete the last element
            if( this.levels_odd_elements[i+2] != undefined){
                let index_next_level_odd = this.levels_odd_elements[i+2];
                let last_element_idx = this.tree[index_next_level_odd].length - 1
                this.tree[index_next_level_odd].splice(last_element_idx, 1)
            }
        }
        // Now the levels_odd_elements can be set to empty
        this.levels_odd_elements = [];
    }


     /**
     * 
     * @param {value to add to the MMR} newDifficultyNode new Leaf Node 
     * This method is used to insert a new leaf on the tree
     * It calculates the new nodes to be inserted
     * the index of the nodes that will be recalculated are inserted in
     * this.levels_odd_elements 
     */
      addLeaf(newDifficultyNode){
        //delete the provisory nodes
        this.cleaningRoutine();
        //calculate the hash of the value - first convert it to an hex
        let leafNode = newDifficultyNode;
        //add the DifficultyNode in the Difficulty MMR
        this.tree[0].push(leafNode);

        //console.log("   Pushing Difficulty in infoArray for easier retrieval")
        //console.log(this.tree[0])
        var leafInfoArrayLen = this.leafInfoArray.length;
        //sum the last cumulative value with the current cumulative value
        //and store it in the leafInfoArray
        var newTotalDifficulty = leafNode.getNodeDifficulty();
        if(leafInfoArrayLen >= 1)
            newTotalDifficulty += this.leafInfoArray[leafInfoArrayLen - 1];
        this.leafInfoArray.push( newTotalDifficulty);

        //OPTIONAL: NOT NEEDED - adjust starting point
        /*if(this.leafInfoArray[0] == undefined)
            this.leafInfoArray.push(difficulty);
        else
            this.leafInfoArray.push(difficulty - this.leafInfoArray[0]);*/
        //console.log(this.leafInfoArray);

        let i = 0;
        //this variable sets if a peak needs to be calculated
        let peak_needed = true;

        while(i< this.tree.length){
            let len_current_level = this.tree[i].length;
            //when we arrive to a level where the number of nodes is odd
            //we stop the peak calculation ( since all the sub-trees in the MMR are binary trees)
            //we store the odd levels in an array to remember where the provisory nodes are
            if(this.tree[i].length % 2 != 0){
                this.levels_odd_elements.push(i)
                if(peak_needed == true){
                    peak_needed = false;
                }
            }
            //if we are not yet arrived to a level where we 
            //have a odd number of nodes we start building the hash nodes
            if(peak_needed == true){
                // In the level we perform the hash between the 
                // last but one and last node
                //The call to Merge DifficultyNodes will take care of merging the leaves
                let mergedLeaf = 
                    this.tree[i][len_current_level-2].mergeNodes(this.tree[i][len_current_level-1])
                // if the above level is not defined, we initialize it to an array (root insertion)
                // and then push in it the new node at the level directly above
                if(this.tree[i+1] == undefined){
                    //insert empty array
                    this.tree.push([]);
                }
                this.tree[i+1].push(mergedLeaf);
            }
            i++;
        } 

        //This is a DifficultyNode variable
        let hash_odd_leaf = 0
        //now we need to calculate the provisory hashes that will lead to the root
        for(let i=0; i< this.levels_odd_elements.length && this.levels_odd_elements.length!=1; i=i+1){
        
            //if we have not created a provisory node yet
            if(hash_odd_leaf == 0){
                //get index of the current odd level
                let curr_level = this.levels_odd_elements[i]
                //get index of the next odd level
                let next_level = this.levels_odd_elements[i+1]
                //get the length of both of the levels since we need the last node
                //of each odd level
                let len_current_level = this.tree[curr_level].length;
                let len_next_level = this.tree[next_level].length;
                //we merge the last odd node of the above level with the one of the current level
                hash_odd_leaf = 
                    this.tree[next_level][len_next_level-1].mergeNodes( this.tree[curr_level][len_current_level-1])

                //if a following odd level a third odd level is not defined
                //create a final level on the tree that will contain a provisory root
                //else add the new node in the next level
                if(this.levels_odd_elements[i+2] == undefined){
                    this.tree[this.tree.length] = []
                    //this is the peak
                    // -1 since from the above function the tree length has increased 
                    this.tree[this.tree.length - 1].push(hash_odd_leaf);      
                    break;
                }
                else{
                        this.tree[this.levels_odd_elements[i+2]].push(hash_odd_leaf);
                }
                //since we analyzed to elements the array index must be moved by two positions
                i++;
            } 
            else{
                //get index of the current odd level
                let curr_level = this.levels_odd_elements[i]
                let len_current_level = this.tree[curr_level].length;
                //len_current_level-2: the -2 since we have added in that level the new peak
                hash_odd_leaf =
                    this.tree[curr_level][len_current_level-2].mergeNodes(hash_odd_leaf)   
                //if a following odd level not exists create one and put the new root in it
                if(this.levels_odd_elements[i+1] == undefined ){
                    this.tree.push( [] )
                    //this is the peak
                    // -1 since from the above function the tree length has increased 
                    this.tree[this.tree.length - 1].push(hash_odd_leaf);      
                    break;
                }
                else{
                    this.tree[this.levels_odd_elements[i+1]].push(hash_odd_leaf)
                }
            }             
        }
    }

    /**
     * 
     * @param {*} leaf_index - index of the leaf of which the proof is requested 
     * @param {*} level (in future update - for now all the proof is provided)
     * @returns all DifficultyNodes of the proof
     */
    getLeafProof(leaf_index, level = 0){
        //array of DifficultyNodes that will be used for MMR Proof
        let proof_nodes = []
        let level_info = 0;
        //check if the leaf index exists
        //the last level contains the root so we can avoid checking it 
        for(let i=level; i< this.tree.length - 1; i++){
            //if the leaf we are searching for is undefined 
            //we continue exploring the tree
            if(this.tree[i][leaf_index] == undefined){
                leaf_index = Math.floor(leaf_index/2);
                continue;
            }


            //if the leaf hash a even index (is in an odd position)
            if(leaf_index % 2 == 0){
                //check if the element on its right exists 
                if(this.tree[i][leaf_index+1]!=undefined && this.tree[i][leaf_index+1]!=null){
                    //if exists it is part of the proof
                    proof_nodes.push(this.tree[i][leaf_index+1])
                }
                else{
                    //if doesn't exits this node has been hashed with
                    //the one on the first odd level after it

                    //if we are on the first level to have an odd number of leafs
                    //we need in the proof the next level node
                    //else the previous level one
                    if(i == this.levels_odd_elements[0])
                        level_info = this.levels_odd_elements.indexOf(i) + 1;
                    else
                        level_info = this.levels_odd_elements.indexOf(i) - 1;
                    
                    //push in the proof the last node of the previous/next odd level
                    proof_nodes.push(this.tree[this.levels_odd_elements[level_info]][this.tree[this.levels_odd_elements[level_info]].length - 1])
                }
            }

            
            if(leaf_index % 2 == 1){

                if(this.tree[i][leaf_index-1]!=undefined){
                    proof_nodes.push(this.tree[i][leaf_index-1])
                }
                //this code can be useful?
                /*else{
                    //find the position in the odd level array 
                    let level_info = this.levels_odd_elements.indexOf(i) + 1;
                    //get the last valid peak of that level
                    
                    proof_nodes.push(this.tree[this.levels_odd_elements[level_info]][this.tree[level_info].length - 1])
                }*/

            }
            leaf_index = Math.floor(leaf_index/2);
        }
        return proof_nodes;
    }

    /**
     * Perform a binary search on arr with val
     * @param {*} arr array to check 
     * @param {*} val value to find in array
     * @returns index of position closest to specified value
     */
    binarySearchClosest(arr, val) {
        let start = 0;
        let end = arr.length - 1;
        let mid = 0;
       // console.log("LAST ELEMENT OF ARRAY" + end);
        while (start <= end) {
          mid = Math.floor((start + end) / 2);
      
          if (arr[mid] == val) {
            return mid;
          }
      
          if (val < arr[mid]) {
            end = mid - 1;
          } else {
            start = mid + 1;
          }
        }
        return mid;
      }
}


module.exports = DifficultyMMRTree