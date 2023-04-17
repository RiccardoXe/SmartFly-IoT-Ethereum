var express = require('express');
const Prover = require('./Prover');
const fs = require('fs');
var app = express();
//port of the web server - API interface - to connect type on browser localhost:port
var JSONConfiguration = JSON.parse(fs.readFileSync("./configuration_smartcontract_invocation.json"));
const port = JSONConfiguration['http_service_port'];

//Home page showing options - accessible through localhost:port
app.get('/', (req, res) => {
    arrayInstructions = ["ADD LEAF - Untrusted          [TESTING ONLY]: /MMR/addLeafU/<numberOfBlocksToInsert>",
                         "ADD LEAF - Partially Trusted  [TESTING ONLY]: /MMR/addLeafPT/<numberOfBlocksToInsert>",
                         "SEND DEFAULT TRANSACTION      [TESTING ONLY]: /MMR/sendDefault/",
                         "GET LEAF AND PROOF FROM RELATIVE DIFFICULTY:  /MMR/getLeafProof/<relativeDifficulty>",
                         "GET LEAF AND PROOF FROM BLOCK INDEX:          /MMR/getLeafProofByIndex/<blockIndex>",
                         "GET PROOF:                                    /MMR/getProof/<leafHashValue>",
                         "GET TX PROOF:                                 /MMR/getTxProof/<txHash>",
                         "GET ROOT:                                     /MMR/root",
                         "GET ALL LEAFS:                                /MMR/getAllLeafs"]
    res.json({msg: "Welcome to the SMARTFLY API",
                options: arrayInstructions})
});

//Add a leaf composed of numberBlocks in the MMR stored in the SC
//this functionality will be deleted in the official release
app.get('/MMR/addLeafU/:numberBlocks',  (req, res) => {
    let numberBlocks =  parseInt(req.params.numberBlocks);
    if(numberBlocks < 0){
        res.json( {error: "A positive number must be provided" } )
    }
    let startingOffset = numberBlocks;
    (async () => {
        let txMMRHash = await MyProver.updateUntrusted(numberBlocks, startingOffset);
        res.json({transactionHashMMRUpdate: txMMRHash});
    })();
});

//Add a leaf composed of numberBlocks in the MMR stored in the SC semi-trusted
//this functionality will be deleted in the official release
app.get('/MMR/addLeafPT/:numberBlocks',  (req, res) => {
    let numberBlocks =  parseInt(req.params.numberBlocks);
    if(numberBlocks <= 0){
        res.json( {error: "A positive number must be provided" } )
    }
    let startingOffset = numberBlocks;
    (async () => {
        let txMMRHash = await MyProver.updatePartiallyTrusted(numberBlocks, startingOffset);
        res.json({transactionHashMMRUpdate: txMMRHash});
    })();
});

//Send a default transaction to increase the transactions (and blocks) in the private chain
//this functionality will be deleted in the official release
app.get('/MMR/sendDefault/',  (req, res) => {

    (async () => {
        let txMMRHash = await MyProver.sendDefaultTransaction();
        res.json({transactionHashMMRUpdate: txMMRHash});
    })();
});

/**
 * Given a relativeDifficulty [0,1] this method retrieve 
 * the block corresponding to that particular difficulty
 */
/*
app.get('/MMR/getBlock/:relativeDifficulty',  (req, res) => {
    let relativeDifficulty =  req.params.relativeDifficulty;
    let blockInfo = MyProver.getBlockFromDifficulty(relativeDifficulty);
    res.json({block: blockInfo[0], difficulty: blockInfo[1]});

});*/

//get leaf and proof, for leaf that covers the "relativeDifficulty" specified
app.get('/MMR/getLeafProof/:relativeDifficulty', (req, res)=> {
    let relativeLeafDifficulty = req.params.relativeDifficulty;
    if(relativeLeafDifficulty > 1 || relativeLeafDifficulty < 0){
        res.json( { error : "Only a range from 0 to 1 is admitted" } )
    }
    else{
    // leaf info format: {leafInfo: , blocksCoveredByLeaf: ,patricaProofTxMMR: }
        (async () => {
            res.json( await MyProver.getLeafAndProofFromDifficulty(relativeLeafDifficulty) );
        })();
    }
});

//get leaf and proof, for leaf at position "index" (used for debugging)
app.get('/MMR/getLeafProofByIndex/:index', (req, res) => {
    let blockIdx = parseInt(  req.params.index );
    //the block index must be positive
    if(blockIdx < 0 ){
        res.json({error: "Only positive index allowed"})
    }
    //this check also it is covered by the tree
    else{
        ( async() => {
            res.json( await MyProver.getLeafAndProofFromBlockIdx( blockIdx));
        })();
    }
});


//Get proof for transaction with hash "txHash"
app.get('/MMR/getTxProof/:txHash',  (req, res)=> {
    let txHash = req.params.txHash;
    //check if it has the format of a txHash
    (async () => {
        res.json( await MyProver.getLeafAndProofFromTxHash(txHash));
    })();
});

//get all the leafs composing the MMR
app.get('/MMR/getAllLeafs', (req, res) => {
    res.json( MyProver.getLocalMMRLeafs())
});

//Get the root of the MMR
app.get('/MMR/root', (req, res) => {
    /*(async () => {
        res.json({rootSmartContract: await MyProver.getSCRoot(), rootMMR: MyProver.getMMRRoot()});
    })();*/
    (async() => {
        res.json(await MyProver.getSCRootProof());
    })();
});

//Test if ROOT in SC is the same as ROOT in local MMR
app.get('/MMR/Test', (req, res) => {
    (async () => {
        res.json({rootSmartContract: await MyProver.getSCRootTest(), rootMMR: MyProver.getMMRRoot()});
    })();
});

//OPTIONAL: send back proof for a specific difficulty - not needed
// Nodes
/*app.get('/mmr/:difficulty', (req, res) => {
    //important to parse or the the function will fail to get the values
    var diff = parseInt(req.params.difficulty);
    //res.send('The selected difficulty is: ' + diff);
    //json response 
    let proofa = mmra.get_leaf_proof(diff, 0);
    res.json({proof : proofa});
});*/

//ger proof from leaf values (hash of leaf)
app.get('/MMR/getProof/:leaf_value', (req, res) => {
    //important to parse or the the function will fail to get the values
    var leaf_hash = req.params.leaf_value;
    //check 
    //proof Array contains all the data needed to the prover to verify the presence of block in the chain
    var proofArray = MyProver.getLeafOnlyMMRProof(leaf_hash);
    if(proofArray == null){
        res.json({"error":"The specified leaf hash doesn't exist"})
    } else{
        res.json({index: proofArray[0], 
        last_leaf_idx: proofArray[1],
        proof : proofArray[2]});
    }

})


//Initialize all the system and start server
var MyProver = new Prover();
(async () => {
    await MyProver.initializeBlockManager();
    console.log("Proving service active...")
    app.listen(port, () => console.log(`MMR service is listening on port ${port}!`))
})();
