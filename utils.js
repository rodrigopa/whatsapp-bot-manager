async function getContactId(client, number) {
    const contact = await client.getNumberId(number);
    if (!contact)
        return false;

    return contact._serialized;
}

async function retry(promiseFactory, retryCount) {
    try {
        return await promiseFactory();
    } catch (error) {
        if (retryCount <= 0) {
            throw error;
        }
        return await retry(promiseFactory, retryCount - 1);
    }
}

async function updateBotData(botId, redisClient, callback) {
    const botRawData = await redisClient.HGET('bots', `bot-${botId}`);
    const botData = JSON.parse(botRawData);
    const modifiedData = callback(botData);

    await redisClient.sendCommand(['HSET', 'bots', `bot-${botId}`, JSON.stringify(modifiedData)]);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getContactId,
    retry,
    updateBotData,
    sleep
}
