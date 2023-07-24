import matplotlib.pyplot as plt
import numpy as np
import math
#add arguments in order to do untrusted or semi-trusted
import sys
from datetime import date

########## INPUT TO SCRIPT ############

#Set values for different trustHp
endingFileNameUntrusted = "_exp.txt"
endingFileNameSemi = "_semi_exp.txt"
saveFileName = "_both"
#######################

fontlabel=54
fonttext=54
fontaxis=50
maxBlocksPerLeaf = 512

#cost of 2021
#NOTICE these values has decreased after new fork! Date of those values: 23/04/2022 
#https://explorer.bitquery.io/ethclassic/gas?from=2021-01-01&till=2021-01-31
gasCostInGwei = 10

GweiToEther = 1000000000
#EtherToEuro = 2750
#update to 07/06/2022
#EtherToEuro = 1750
#update to 14/06/2022

#https://finance.yahoo.com/quote/ETC-EUR/history?period1=1609459200&period2=1643587200&interval=1mo&filter=history&frequency=1mo&includeAdjustedClose=true
EtherToEuro = 25


numberOfBlockPerLeaf = 1
#Label of X Axis containg the number of block per leaf in format ['1','2','4',...,'256']
xAxisLabel = [1,2,4,8,16,32,64,128,256,512]
#Array to contain data readed from a single file
dataArrays = []
#Array containg cumulaive cost for each scenario
cumulativeArrayUntrusted = []
cumulativeArrayCostEuroUntrusted = []

cumulativeArraySemi = []
cumulativeArrayCostEuroSemi = []

#Array containing avarage cost for one block insertion
avgArrayUntrusted = []
avgArrayCostEuroUntrusted = []
avgArraySemi = []
avgArrayCostEuroSemi = []

#Number of blocks in simulation
numberOfBlocksInSimulation = 2048
#Util variable to contain sum cost for one escenario at a time
sumA = 0

#VALUES USED FOR THESIS (From real gas and stock exchangers)
#gasCostInGwei = 141
#GweiToEther = 1000000000
#EtherToEuro = 3920

conversionGasEuro = gasCostInGwei * EtherToEuro / GweiToEther

#Get data untrusted
for numberOfBlockPerLeaf in xAxisLabel :

    path = "./GasCostsPaper/GCF" + str(numberOfBlockPerLeaf) + endingFileNameUntrusted
    
    f = open(path, "r")
    dataString = f.read()

    dataArray = dataString.split(" ")
    if len(dataArray)<math.ceil(numberOfBlocksInSimulation/numberOfBlockPerLeaf):
        print("LESS ELEMENTS in "+path)
        exit
    dataArray = dataArray[:math.ceil(numberOfBlocksInSimulation/numberOfBlockPerLeaf)]
    sumA = 0

    for data in dataArray:
        #print(data)
        if data != '':
            sumA = sumA + (int(data))
    print('Blocks per Leaf'+ str(numberOfBlockPerLeaf)+' - Sum '+ str(sumA) )
    #Add the sum of this scenario in cumulativeArray
    cumulativeArrayUntrusted = cumulativeArrayUntrusted + [sumA]
    cumulativeArrayCostEuroUntrusted = cumulativeArrayCostEuroUntrusted + [sumA * conversionGasEuro]

    #Perform avg calculation in this scenario 
    avgValue = math.ceil( sumA / (len(dataArray)*numberOfBlockPerLeaf) )
    avgArrayUntrusted = avgArrayUntrusted + [avgValue]
    avgArrayCostEuroUntrusted = avgArrayCostEuroUntrusted + [avgValue * conversionGasEuro ]

    #plt.plot(str(index), sumA, '-ro', label="Blocks per leaf: " + str(index))
    #xAxisLabel = xAxisLabel + [numberOfBlockPerLeaf]
    numberOfBlockPerLeaf = numberOfBlockPerLeaf * 2

#get data semi-trusted
numberOfBlockPerLeaf = 1
for numberOfBlockPerLeaf in xAxisLabel :

    path = "./GasCostsPaper/GCF" + str(numberOfBlockPerLeaf) + endingFileNameSemi
    
    f = open(path, "r")
    dataString = f.read()

    dataArray = dataString.split(" ")
    if len(dataArray)<math.ceil(numberOfBlocksInSimulation/numberOfBlockPerLeaf):
        print("LESS ELEMENTS in "+path)
        exit
    dataArray = dataArray[:math.ceil(numberOfBlocksInSimulation/numberOfBlockPerLeaf)]
    sumA = 0

    for data in dataArray:
        #print(data)
        if data != '':
            sumA = sumA + (int(data))
    print('Blocks per Leaf'+ str(numberOfBlockPerLeaf)+' - Sum '+ str(sumA) )
    #Add the sum of this scenario in cumulativeArray
    cumulativeArraySemi = cumulativeArraySemi + [sumA]
    cumulativeArrayCostEuroSemi = cumulativeArrayCostEuroSemi + [sumA * conversionGasEuro]

    #Perform avg calculation in this scenario 
    avgValue = math.ceil( sumA / (len(dataArray)*numberOfBlockPerLeaf) )
    avgArraySemi = avgArraySemi + [avgValue]
    avgArrayCostEuroSemi = avgArrayCostEuroSemi + [avgValue * conversionGasEuro ]

    numberOfBlockPerLeaf = numberOfBlockPerLeaf * 2

print(avgArrayCostEuroUntrusted)
print(avgArrayCostEuroSemi)
##############################################################
#Plot Cumulative Gas Cost 8h of simulation
'''
plt.figure(0)

fig, host = plt.subplots()
parEuro = host.twinx()

host.plot(xAxisLabel, cumulativeArray, '--ro')
parEuro.plot(xAxisLabel, cumulativeArrayCostEuro, '--ro')
#Range to Show in Y axis
host.set_yticks( np.arange(32000000, 240000000, 10000000 ))
parEuro.set_yticks( np.arange(32000000*conversionGasEuro, 240000000*conversionGasEuro, 10000000*conversionGasEuro ))
#Axis labels
host.set_xlabel("Number Of Blocks Per Leaf", fontsize=fontlabel)
host.set_ylabel("Cumulative Gas Cost for 8h of Simulation", fontsize=fontlabel)
parEuro.set_ylabel("Cumulative Cost in Euro for 8h of Simulation", fontsize=fontlabel)
#Show points coordinates in plot
for xVal, yVal in zip(xAxisLabel, cumulativeArray):
    # {:.2e} Write in scentific notation with only 2 number after .0 
    host.text(xVal, yVal + 8000000 ,'{:.2e} Gas;\n{:.2e} Euro;'.format(yVal, yVal*conversionGasEuro), fontsize=fonttext )
#Set x axis limit (to avoid cutting our string in point coordinates)
host.set_xlim(-0.2 , 11)
host.tick_params(axis='both', which='major', labelsize=fontaxis)
parEuro.tick_params(axis='both', which='major', labelsize=fontaxis)

#Adjust resolution and save in file
#fig = fig.gcf()
fig.set_size_inches(20, 10)
fig.savefig('./PaperPlots/CumulativeGasCost' + str( date.today() ) +'.svg')
#plt.show()
'''
##############################################################
#Plot AVG Gas Cost For Single Block Insertion 8h of simulation 
plt.figure(1)

fig, host = plt.subplots()
parEuro = host.twinx()

print("----------------")
print(xAxisLabel)
print("----------------")
host.plot(xAxisLabel,avgArrayUntrusted, '--ro', label='appenders cost')
#host.plot(xAxisLabel, avgArraySemi, '--bo', label='supervised')

host.legend(loc="upper right", prop={'size': 45})
#parEuro.plot(xAxisLabel, avgArrayCostEuroUntrusted, '--ro')


#automatically create ticks by getting the min and max value registerd
#   min ticks a little smaller
minTick = int(min(avgArraySemi)/1000)*900
#   max tick a little bigger
maxTick = int(max(avgArrayUntrusted)/1000)*1200
#   around 10 steps
stepTick = (maxTick - minTick)/ 5

host.set_yticks( np.arange(minTick, maxTick + stepTick , stepTick))
parEuro.set_yticks( np.arange(minTick*conversionGasEuro, (maxTick + stepTick) *conversionGasEuro, stepTick*conversionGasEuro))

for elem in np.arange(minTick, maxTick + stepTick ,stepTick):
    host.axhline(y=elem, color='grey', linestyle='--', linewidth=1)

#Show points coordinates in plot
#for xVal, yVal in zip(xAxisLabel, avgArray):
#    # {:.2e} Write in scentific notation with only 2 number after .0 
#    host.text(xVal, yVal + 3000 ,'{:.2e} Gas;\n{:.4f} Euro;'.format(yVal, yVal*conversionGasEuro), fontsize=fonttext )
#Set x axis limit (to avoid cutting our string in point coordinates)
#host.set_xlim(-0.2 , 9.2)
host.set_xticks([1,16,64,128,256,512])
host.set_ylim(minTick, maxTick)
parEuro.set_ylim(minTick*conversionGasEuro, maxTick*conversionGasEuro)

#set x and y lable font size
host.tick_params(axis='both', which='major', labelsize=fontaxis)
parEuro.tick_params(axis='both', which='major', labelsize=fontaxis)
#parEuro.tick_params(axis='both', which='major', labelsize=fontaxis)

#set labels
host.set_xlabel("# of blocks per leaf", fontsize=fontlabel)
host.set_ylabel("avg gas cost to append\n 1 block to the MMR", fontsize=fontlabel)
parEuro.set_ylabel("avg euro cost to append\n 1 block to the MMR", fontsize=fontlabel)
#parEuro.set_ylabel("Avg Euro Cost To Insert 1 Block in MMR", fontsize=fontlabel)

#Adjust resolution and save in file
#fig = plt.gcf()
fig.set_size_inches(30, 12)
#set parameters for tick labels
plt.tick_params(axis='x', which='major', labelsize=fontaxis)
fig.savefig('./PaperPlots/AvgGasCost' + str( date.today() ) + saveFileName+ '.pdf', bbox_inches='tight')


'''
19707655065904 Mar-23-2016 02:36:47 AM +UTC
19707655066928 Mar-23-2016 02:36:58 AM +UTC 11
19707655067952 Mar-23-2016 02:37:15 AM +UTC 17
19659540676721 Mar-23-2016 02:38:19 AM +UTC 64
19611543752265 Mar-23-2016 02:39:20 AM +UTC 61
19563664007804 Mar-23-2016 02:40:21 AM +UTC 61
19554111438512 Mar-23-2016 02:40:50 AM +UTC 29
19563659345511 Mar-23-2016 02:40:55 AM +UTC 5
19573211914574 Mar-23-2016 02:40:56 AM +UTC 1
19573211915598 Mar-23-2016 02:41:06 AM +UTC 10
19554097451862 Mar-23-2016 02:41:45 AM +UTC 39
'''