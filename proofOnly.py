'''
Script useful to simulate a proof execution in 
order to see the proof size and perform benchmarks on it
'''

import os

#adversary fraction of power - cs and chain lengths
#########################################
#cs = ["0.1","0.3"]
#chainLengths = [230400]
#########################################
# Adversarial assumptions - c in Bunz model
cs = ["0.1","0.3","0.5"]
#Number of blocks SC should cover
#the chain length goes form 0 to 230400 using 5 steps (multiple of 512) 
chainLengths = [512,2048]+[ (512*90)*x for x in range(1,6)] #must be 6 but 5 already simulated
#########################################

# blocks to always check - L value in Bunz model
Lblocks = 30

#gives security bigger that 0,1% - lambda in Bunz model
lambs = [50,80,100]

#number of blocks per leaf to test
numberOfBlocksPerUpdateArray = [1,8,16,64,128]

#number of experiments to perform - 30 good value to have an avg and 
# be able to calculate CI
expNumber = 30

#generate all experiments - this generates a dummy MMR -
# please check the code invoked by ./js/DataModule/GenerateProofs.js
# - for every lambda
# - for every adversary assumption 
# - for every chain length to test 
# - for every number of blocks per leaf
for c in cs:
    for chainLength in chainLengths:
        for numberOfBlocksPerUpdate in numberOfBlocksPerUpdateArray:
            for lamb in lambs:
                os.system(" node ./js/DataModule/GenerateProofs.js" +
                            " " + str(numberOfBlocksPerUpdate) + 
                            " " + c +
                            " " + str(Lblocks) +
                            " " + str(lamb) +
                            " " + str(chainLength) +
                            " " + str(expNumber)
                        )