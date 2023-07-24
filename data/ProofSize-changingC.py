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
fontaxis=40
marksize = 12
linewidth = 2
colours_array = ['b','g','r','c','m','k']

cs=[0.1,0.3,0.5]
L = 30
#L = 2880
lamb = 50
ch = 115200*2
#maxBlocksPerLeaf = [1,64,128,256,512]
maxBlocksPerLeaf = [1,8,16,64,128]
L_size = (L-1) * 508/1000
####################

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

    print("-----------------------------")
    print(variance)
    print(CI)
    print("-----------------------------")
        
    upper = mean + CI
    lower = mean - CI

    return upper, lower


#plot styling 
fig, ax = plt.subplots()
ax.ticklabel_format(useOffset=False, style='plain')

#for each block per leaf value
for c in cs[::-1]:
    meanArray = []
    upperArray = []
    lowerArray = []
    # get all values of mean, CI in different 
    for blocks in maxBlocksPerLeaf:
        mean = getMean("./ProofSizesPaper/ProofSizeInteval_n=",c,L,lamb,ch,blocks)
        meanArray = meanArray + [mean]
        upperVal,lowerVal = getCI("./ProofSizesPaper/ProofSizeInteval_n=",c,L,lamb,ch, blocks, mean)
        upperArray = upperArray + [upperVal]
        lowerArray = lowerArray + [lowerVal]
    
    print(meanArray)
    print(upperArray)
    print(lowerArray)
    #plot the lines corresponding to a fixed MMR leaf per blocks 
    #plot mean
    ax.plot(maxBlocksPerLeaf, meanArray, label='c=' + str(c))
    #plot CIs
    ax.plot([maxBlocksPerLeaf,maxBlocksPerLeaf],[upperArray, lowerArray], color="k")

plt.xlabel("# of blocks per MMR leaf", fontsize=fontlabel)
plt.ylabel("avg proof size [KB]", fontsize=fontlabel)
plt.legend(prop={'size':fonttext})
plt.xticks(maxBlocksPerLeaf)

#add horizontal lines
plt.ylim(0,12000)
array = [x*2000 for x in range(0,6)]
for elem in array:
    plt.axhline(y=elem, color='grey', linestyle='--', linewidth=1)
    

ax.tick_params(axis='both', labelsize=fontaxis)
fig.set_size_inches(20,12)
fig.savefig('./PaperPlots/L='+str(L) +'-OnlyCNewChangingProofSizeComparison' + str( date.today() ) + '.pdf', bbox_inches='tight')
