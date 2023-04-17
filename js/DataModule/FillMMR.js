const Prover = require('../Prover Module/Prover');
const fs = require('fs');

(async () => {
        let args = process.argv
        //Blocks per MMR leaf
        let numberOfBlockPerUpdate = parseInt(args[2])
        //0) Untrusted 1) semi-trusted
        let trustHp = parseInt(args[3])
        //8 hours of simulation (15 sec per block)
        let totalNumberOfBlocks = parseInt(args[4])

        let prover = new Prover();

        if(totalNumberOfBlocks % numberOfBlockPerUpdate !=0){
            totalNumberOfBlocks = Math.ceil(totalNumberOfBlocks/numberOfBlockPerUpdate)*numberOfBlockPerUpdate
        }
        
        await prover.initializeBlockManager();

        //fill with dummy blocks the start (a transaction belongs to truffle for this reason we have numberOfBlockPerUpdate-1)
        if(trustHp != 0){
            for(let i = 0; i < numberOfBlockPerUpdate-1;  i ++ ){
                await prover.sendDefaultTransaction();
            }
        }

        //Send a SC invocation or a default transaction
        for(let i = 0; i <= totalNumberOfBlocks;  i ++ ){
            //make a smart contract invocation
            if(i % numberOfBlockPerUpdate == 0){
                // TESTING - in order to have a different timestamp every time (for 1 block per leaf scenario)
                //////////////////////////////////
                if(trustHp == 0){
                    fs.appendFile('./data/GasCostsPaper/GCF' + numberOfBlockPerUpdate + '_exp.txt', (await prover.updateUntrusted(numberOfBlockPerUpdate, numberOfBlockPerUpdate)).gasUsed + " ", function (err) {
                            if (err) throw err;
                            console.log('Saved!');
                    }); 
                } else{
                    fs.appendFile('./data/GasCostsPaper/GCF' + numberOfBlockPerUpdate + '_semi_exp.txt', (await prover.updatePartiallyTrusted(numberOfBlockPerUpdate, numberOfBlockPerUpdate)).gasUsed + " ", function (err) {
                        if (err) throw err;
                        console.log('Saved!');
                }); 
                }
              
            } 
            //send a default transaction 
            else {
                    await prover.sendDefaultTransaction();
            }
        }
        data = true;
})();

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

data = false;
// start polling at an interval until the data is found at the global
var intvl = setInterval(function() {
    if (data) { 
        clearInterval(intvl);
        return ;
    }
}, 10000);

