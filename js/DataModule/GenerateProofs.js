const Prover = require('../Prover Module/Prover');
const fs = require('fs');

    let args = process.argv
    let numberOfBlockPerUpdate = parseInt(args[2])
    
    //fraction of adversary power
    let c = args[3];
    //number of leafs to always check
    let L = parseInt(args[4]);
    //lambda probability of failure 2**(-lambda)
    let lambda = parseInt(args[5]);
    //chain length
    let chainLength = parseInt(args[6]);
    //number of experiments
    let expNumber = parseInt(args[7]);

    let prover = new Prover();
    //not needed to initialize block manger since ths proof size is
    // generated only using the local MMR
    //await prover.initializeBlockManager();

    //Fill the MMR with dummy values
    prover.fillDummyMMR(numberOfBlockPerUpdate,chainLength);
    
    // once the MMR is set start recording proof sizes (30 times for each scenario)
    for(let i = 0; i < expNumber; i++ ){
        //proofSize = await prover.generateProofForInteval(numberOfBlockPerUpdate);
        //every experiment uses a different seed
        proofResponse = prover.generateProofSimulation(numberOfBlockPerUpdate, c, L, lambda, chainLength, i);
        proofSizeNoDuplicates = proofResponse.proofSizeNoDuplicates;
        proofSizeWithDuplicates = proofResponse.proofSizeWithDuplicates;

        console.log("Recorded proof size =" + proofSizeNoDuplicates)
        fs.appendFileSync('./data/ProofSizesPaper/ProofSizeInteval_n=' + numberOfBlockPerUpdate +'_c='+ c +"_L="+ L + "_lamb="+ lambda + "_cl="+ chainLength+ '.txt',
          (proofSizeNoDuplicates+" ")  ,
           function (err) {
            if (err) throw err;
            console.log('Saved!');
        }); 

        fs.appendFileSync('./data/ProofSizesPaper/DuplicatesProofSizeInteval_n=' + numberOfBlockPerUpdate +'_c='+ c +"_L="+ L + "_lamb="+ lambda + "_cl="+ chainLength+ '.txt',
        (proofSizeWithDuplicates+" ")  ,
         function (err) {
          if (err) throw err;
          console.log('Saved!');
      }); 
    }
