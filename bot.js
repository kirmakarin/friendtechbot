const ethers = require('ethers');
const fs = require('fs');
require("dotenv").config();

const friendsAddress = '0xCF205808Ed36593aa40a44F10c7f7C2F67d4A4d4';
const url = process.env.WEBSOCKET_URL;
const provider = new ethers.WebSocketProvider(url);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);

const friends = new ethers.Contract(
    friendsAddress,
    [
      'function buyShares(address arg0, uint256 arg1)',
      'function getBuyPriceAfterFee(address sharesSubject, uint256 amount) public view returns (uint256)',
      'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)',
    ],
    account
);


const FOLLOW_NUM = 1000;  // Adjust this number as per your requirement.
const TWITTER_SCOUT_SCORE = 250;  // Adjust this number as per your requirement.
const TWITTER_SCOUT_PERFECT_SCORE = 500;  // Adjust this number as per your requirement.
const MAX_BUY_PRICE = 25000000;
const balanceArray = [];
const amigosArray = [];

const isNewAccount = ({ traderAddress, subjectAddress, isBuy, ethAmount, shareAmount, supply }) => {
  return (
    traderAddress === subjectAddress &&
    isBuy &&
    ethAmount === '0' &&
    supply <= 5
  );
};

const run = async () => {
  let filter = friends.filters.Trade(null, null, null, null, null, null, null, null);

  friends.on(filter, async (event) => {
    const details = {
      traderAddress: event.args[0],
      subjectAddress: event.args[1],
      isBuy: event.args[2],
      ethAmount: event.args[4].toString(),
      shareAmount: event.args[3],
      supply: event.args[7]
    };
    if(amigosArray.indexOf(event.args[1]) !== -1) {
      return;
    }
    amigosArray.push(event.args[1]);

    // if (details.isBuy && isNewAccount(details)) {
    if (details.isBuy && details.supply < 10 ){
      const amigo = event.args[1];
      const feeData = await provider.getFeeData();
      const weiBalance = await provider.getBalance(amigo);

      for (const botBalance in balanceArray) {
        if (weiBalance > botBalance - 300000000000000 && weiBalance < botBalance + 300000000000000) {
          return;
        }
      }

      if (weiBalance > 95000000000000000 && weiBalance < 105000000000000000) return;
      balanceArray.push(weiBalance);
      if (balanceArray.length > 20) balanceArray.shift();

      const userData = await getUserData(amigo);
      const twitterUsername = userData.twitterUsername;
      let buyPrice = await friends.getBuyPriceAfterFee(amigo, 1);
      const myBalance =  await provider.getBalance('0xDC94d0C56285E70274f7C5e14670CcAb28A9D677');

      if(buyPrice >= myBalance)
        return;
       let qty = await twitterCheck(twitterUsername, FOLLOW_NUM);
      console.log(`${twitterUsername} qty = ${qty}`);

      if (qty > 0) {

        buyPrice = await friends.getBuyPriceAfterFee(amigo, qty);
        console.log(`${twitterUsername} price = ${buyPrice}`);
        if ((qty < 2 && buyPrice > 2000000000000000) || buyPrice > 10000000000000000) return;

        console.log('### BUY ###', amigo, buyPrice);
        const tx = await friends.buyShares(amigo, qty, { value: buyPrice, gasPrice: feeData.gasPrice });
        fs.appendFileSync('./buys.txt', amigo + "\n");

        try {
          const receipt = await tx.wait();
          console.log('Transaction Mined:', receipt.blockNumber);
        } catch (error) {
          console.log('Transaction Failed:', error);
        }
      } else {
        console.log(`User ${amigo} (${twitterUsername}) does not meet the follower count requirement.`);
      }
    }
  });
}

async function twitterCheck(twitterUsername , followerNumber) {
  if (!twitterUsername || typeof twitterUsername !== "string") {
    return 0;
  }

  if (!twitterUsername.startsWith('0x')) {
    const twitterUserData = await getTwitterUserData(twitterUsername);
    const followers_count = twitterUserData[0].followers_count
    const statuses_count = twitterUserData[0].statuses_count
    const created_at = twitterUserData[0].created_at
    const accountCreationYear = new Date(created_at).getFullYear();
    if (followers_count > followerNumber
        && statuses_count > 50
        && accountCreationYear <= 2022
    ) {
      console.log(`${twitterUsername} has ${followers_count} followers,
          ${statuses_count} tweets and was created at ${accountCreationYear} `);
      const twitterScore = await getTweetScoutData(twitterUsername);
      if (twitterScore >= TWITTER_SCOUT_PERFECT_SCORE) {
        return 2;
      }
      if (twitterScore >= TWITTER_SCOUT_SCORE) {
        return 1;
      }
    }
  }
  return 0;
}

async function getUserData(address) {
  try {
    const response = await fetch(`https://prod-api.kosetto.com/users/${address}`);
    if (response.ok) {
      const data = await response.json();
      return data || { twitterUsername: address };
    }
  } catch (err) {
    console.error(`Failed to fetch user data for address ${address}: ${err.message}`);
  }
  return { twitterUsername: address };
}

async function getTwitterUserData(profileName) {
  const myHeaders = new Headers({
    "Authorization": `Bearer ${process.env.TWITTER_TOKEN}`
  });

  const requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow'
  };

  try {
    const response = await fetch(`https://api.twitter.com/1.1/users/lookup.json?screen_name=${profileName}`, requestOptions);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error(`Failed to fetch twitter user data for ${profileName}: ${err.message}`);
  }
  return 0;
}

async function getTweetScoutData(profileName) {
  const myHeaders = new Headers({
    "ApiKey": `${process.env.TWEET_SCOUT_TOKEN}`
  });

  const requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow'
  };

  try {
    const response = await fetch(`http://77.232.42.221:52354/api/score/${profileName}`, requestOptions);
    if (response.ok) {
      const data = await response.json();
      const score = data.score;
      console.log(`Twitter score for ${profileName} = ${score}`);
      return score;
    }
  } catch (err) {
    console.error(`Failed to fetch tweet scout user data for ${profileName}: ${err.message}`);
  }
  return 0;
}

try {
  run();
} catch (error) {
  console.error('ERR:', error);
}

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});