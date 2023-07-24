######################### DESCRIPTION ########################
# Script to plot cost of single SmartFly call with two different
# aggregation factor.
# Given numberOfCallsToTake blocks produced, plot the 
# cost of the SmartFly invocation in the specific block index.
# Used to compare the cost between 1 block per MMR leaf 
# (more invocations but less costly invocations) 
# and secondGraphBlocks per MMR leaf 
# (less invocations but more costly invocations)
##############################################################

import matplotlib.pyplot as plt
import numpy as np
import sys
from datetime import date

###### Data to change ######
#Number of blocks produced
numberOfCallsToTake = 32
#Number of blocks per MMR leaf in second scenario
secondGraphBlocks = 4
############################

# 1 Block Per Leaf Data
scCalls = [n+1 for n in range(numberOfCallsToTake)]
dataArrays = []

########## INPUT TO SCRIPT ############
if len(sys.argv) != 2:
    print("Pass the following arguments:")
    print("0) Untrusted plot")
    print("1) Semi-trusted plot")
    exit(1)

trustHp = int(sys.argv[1])
print("Plot for Trust Hypothesis: "+ sys.argv[1])
#Set values for different trustHp
if trustHp == 0:
    endingFileName = "_exp.txt"
    saveFileName = "_untrusted"
else:
    endingFileName = "_semi_exp.txt"
    saveFileName = "_semi_trusted"
    
#######################

path = "./GasCostsPaper/GCF" + str(1) + endingFileName

f = open(path, "r")
dataString = f.read()
dataArray = dataString.split(" ")
dataArrayInteger = []
print(dataArray)
dataArray = dataArray[:numberOfCallsToTake]
for data in dataArray:
    #print(data)
    if data != '':
        dataArrayInteger.append(int(data))

f.close()


# 4 Blocks per Leaf Data

#Number of calls in numberOfCallsToTake given the number of blocks per MMR leaf
elems = int (numberOfCallsToTake / secondGraphBlocks)
#Call indexes for the SC (1 call every secondGraphBlocks)
scCalls4 = [secondGraphBlocks*(n+1) for n in range(elems)]

path = "./GasCostsPaper/GCF" + str(secondGraphBlocks) + endingFileName
f = open(path, "r")
dataString = f.read()
dataArray = dataString.split(" ")
dataArrayInteger4 = []
print(dataArray)
dataArray = dataArray[:elems]
for data in dataArray:
    #print(data)
    if data != '':
        dataArrayInteger4.append(int(data))
#print(dataArrayInteger)
f.close()

#Plot as stemlines (dotted lines starting from X axis and touching Y point)

#plot 1 block per leaf data
markerline, stemlines, baseline = plt.stem(scCalls, dataArrayInteger, bottom=50000, linefmt='b--', markerfmt="bo", label="1 block per leaf")
#increase size of lines and marker
plt.setp(stemlines, 'linewidth', 5)
plt.setp(markerline, markersize=15)
plt.setp(baseline, color='b')

#Plot 4 blocks per leaf data
markerline, stemlines, baseline = plt.stem(scCalls4, dataArrayInteger4, bottom=50000, linefmt='r:', markerfmt="ro", label=str(secondGraphBlocks) +" blocks per leaf")
#increase size of lines and Marker
plt.setp(stemlines, 'linewidth', 5)
plt.setp(markerline, markersize=15)
plt.setp(baseline, color='r')


#Plot estetics
#Value X axis
plt.xticks( np.arange(2,numberOfCallsToTake + 1,5))
#Value Y axis
# min value is the one for the single invocation
minTick = 50000#int(min(dataArrayInteger)/1000)*1000
maxTick = 190000#int(max(dataArrayInteger4)/1000)*1200
stepTick = (maxTick - minTick)/5
plt.yticks( np.arange(minTick, maxTick + stepTick ,stepTick)) 

#Size of ticks of X and Y axis
plt.tick_params(axis='both', which='major', labelsize=50)

#Set Lables and Leggend
plt.xlabel("# of blocks covered \nby the MMR", fontsize=54)
plt.ylabel("gas used per append", fontsize=54)
plt.legend(loc="upper right", prop={'size': 45})

plt.xlim(0, numberOfCallsToTake + 1)
plt.ylim(minTick,maxTick)

#Get current figure
fig = plt.gcf()
fig.set_size_inches(20,12)
fig.savefig('./PaperPlots/SingleCallGasCost1And4' + str( date.today() ) + saveFileName +'.pdf', bbox_inches='tight')