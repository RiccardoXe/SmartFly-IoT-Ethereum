######################### DESCRIPTION ########################
# Plot the avg proof size (with CI 95%) for SmartFly for 
# different number of blocks per MMR leaf. 
##############################################################

from shutil import which
import matplotlib.pyplot as plt
import numpy as np
import math
from datetime import date

#### Label sizes ###
fontlabel=54
fonttext=40
fontlegend = 30
fontaxis=40
marksize = 12
linewidth = 2
colours_array = ['b','g','r','c','m','k']

##########################################################
#L = 2880
#chainLengths = [ (512*90)*x for x in range(1,6)] 

L=30 
chainLengths = [2048] + [ (512*90)*x for x in range(1,6)] 

c=0.5
lamb = 50

MTPAndReciptSizeInBytes = 456
########################################################

#maxBlocksPerLeaf = [1,64,128,256,512]
maxBlocksPerLeaf = [1,8,16,64,128]

# L - 1 is an update since the code already takes in account the blocks containing the last MMR root
L_size = (L - 1) * 508/1000
####################

def getMNumbQueries(c,L,lamb,chainLength):
    in_log = math.log(L/chainLength,c)
    denom = math.log(1 - 1/in_log, 0.5)
    m = lamb / denom
    return m

def getMean(fileName,c,L,lamb,chainLength, blockPerLeaf):
    #Reset the sum variable
    sum_proof_sizes = 0
    #Read data from file
    path = fileName + str(blockPerLeaf) +"_c="+str(c)+"_L="+str(L)+"_lamb="+str(lamb)+"_cl="+str(chainLength)+".txt"
    f = open(path,"r")
    dataString = f.read()
    #split data
    dataArray = dataString.split(" ")
    #reset sum 
    samples  = len(dataArray)
    #To take in account that the last element is empty subtract one
    samples = samples - 1

    #Perform sum (/1000 in order to get KBytes and not bytes + L in order take in account first Ls)
    for data in dataArray:
        if data != '':
            sum_proof_sizes = sum_proof_sizes + (int(data)/1000) + L_size
    mean = sum_proof_sizes / samples
    return mean

def getCI(fileName,c,L,lamb,chainLength, blockPerLeaf, mean):
    sum_quadratic = 0
    #confidence interval 95%
    z = 1.96
    sum_quadratic = 0
    #Read data from file
    path = fileName + str(blockPerLeaf) +"_c="+str(c)+"_L="+str(L)+"_lamb="+str(lamb)+"_cl="+str(chainLength)+".txt"
    f = open(path,"r")
    dataString = f.read()
    #split data
    dataArray = dataString.split(" ")
    #reset sum 
    samples  = len(dataArray)
    #To take in account that the last element is empty subtract one
    samples = samples - 1
    #Perform sum (/1000 in order to get KBytes and not bytes + L in order take in account first Ls)
    for data in dataArray:
        if data != '':
            sum_quadratic = sum_quadratic + (int(data)/1000 + L_size - mean)**2
    #Calculate variance
    variance = sum_quadratic/(samples - 1)
    #Calculate CI and append to array
    CI = z* math.sqrt(variance) / math.sqrt(samples)

    #print("-----------------------------")
    #print(variance)
    #print(CI)
    #print("-----------------------------")
        
    upper = mean + CI
    lower = mean - CI

    return upper, lower


#plot styling 
fig, ax = plt.subplots()
ax.ticklabel_format(useOffset=False, style='plain')

#for each block per leaf value
for blocks in maxBlocksPerLeaf[::-1]:
    meanArray = []
    upperArray = []
    lowerArray = []
    # get all values of mean, CI in different 
    for ch in chainLengths:
        mean = getMean("./ProofSizesPaper/ProofSizeInteval_n=",c,L,lamb,ch,blocks)
        meanArray = meanArray + [mean]
        upperVal,lowerVal = getCI("./ProofSizesPaper/ProofSizeInteval_n=",c,L,lamb,ch, blocks, mean)
        upperArray = upperArray + [upperVal]
        lowerArray = lowerArray + [lowerVal]
    
    print(meanArray)
    #print(upperArray)
    #print(lowerArray)
    #plot the lines corresponding to a fixed MMR leaf per blocks 
    #plot mean
    #ax.plot([2048] + chainLengths, [2048 * 508 /1000] + meanArray, label='blocks per leaf ' + str(blocks))
    
    if blocks == 1:
        ax.plot(chainLengths, meanArray, label=str(blocks) + ' block per leaf ')
        #plot CIs
        ax.plot([chainLengths,chainLengths],[lowerArray, upperArray], color="k")
        
        # Plot also FlyClient
        meanArrayFly = [ meanArray[i] - getMNumbQueries(c,L,lamb, chainLengths[i])*MTPAndReciptSizeInBytes/1000 for i in range(len(meanArray)) ]
        ax.plot(chainLengths, meanArrayFly, linestyle='dashed', label='FlyClient')
    else:
        ax.plot(chainLengths, meanArray, label=str(blocks) + ' blocks per leaf ')
        #plot CIs
        ax.plot([chainLengths,chainLengths],[lowerArray, upperArray], color="k")

plt.xlabel("chain length", fontsize=fontlabel)
plt.ylabel("avg proof size [KB]", fontsize=fontlabel)
plt.legend(prop={'size':fontlegend})

#plt.xticks([2048] +chainLengths)
plt.xticks(chainLengths)

#add horizontal lines
plt.ylim(0,12000)
array = [x*2000 for x in range(0,6)]
for elem in array:
    plt.axhline(y=elem, color='grey', linestyle='--', linewidth=1)

ax.tick_params(axis='both', labelsize=fontaxis)
fig.set_size_inches(20,12)

fig.savefig('./PaperPlots/L='+str(L) +'lamb='+str(lamb)+'-NewChangingProofSizeComparison' + str( date.today() ) + '.pdf', bbox_inches='tight')
