'''
This script fills the mmr in the smart contact 
and it is useful to estimate the SC cost.
It will perform the simulation for multiple number of blocks 
per leaf.

NOTE: A ganache instance with the same parameters configured 
in the truffle-config.js should be started

example - form terminal execute:
ganache-cli  -a 100 -e 10000 -m "DifficultyMMR? Why not?" -p 7200 -l 30000000 -i 7200
-a: to specify accounts
-e: ETH per account
-m: mnemonic (phrase that will be used as seed to generate all the chain information)
-p: port of ganche instance 
-l: gas limit per block (set it to the current values checking the ETC work)
-i: network identifier
For documentation refer to: ganache-cli
'''

import os

#How to start chain from terminal:
#os.system(ganache-cli  -a 100 -e 10000 -m "DifficultyMMR? Why not?" -p 7200 -l 30000000 -i 7200)

#Starting number of blocks per MMR leaf
starting = 1
# 0) untrusted  1) semi-trusted
trustHp = 1
# Chain length to simulate - number of blocks in chian
chainLength = 2048

while starting <= 512 :
    # reset the smart contract - compile it again and deploy it on chain
    os.system(" truffle migrate --reset")
    # .js code that fill the mmr in the smart contract
    os.system(" node ./js/DataModule/FillMMR.js " + str(starting)+" "+str(trustHp)+" "+str(chainLength))
    starting = starting * 2
