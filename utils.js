const {serialize} = require("php-serialize");

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

async function updateBotData(botId, redisClient, callback, notify) {
    const botRawData = await redisClient.HGET('bots', `bot-${botId}`);
    const botData = JSON.parse(botRawData);
    const modifiedData = callback(botData);

    await redisClient.sendCommand(['HSET', 'bots', `bot-${botId}`, JSON.stringify(modifiedData)]);

    if (notify) {
        await pushToLaravelQueue(redisClient, generateQueuePayloadForBot({bot_id: botId, status: modifiedData.status}));
    }
}

async function pushToLaravelQueue(redisClient, data) {
    await redisClient.rPush('queues:default', JSON.stringify(data));
    await redisClient.rPush('queues:default:notify', '1');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomString(len) {
    let s = '';
    let v;
    while(s.length<len&&len>0){
        v = Math.random()<0.5?32:0;
        s += String.fromCharCode(Math.round(Math.random()*((122-v)-(97-v))+(97-v)));
    }
    return s;
}

function generateQueuePayloadForBot(data) {
    class UpdateBotState {
        constructor(data) {
            this.data = data;
            this.job = null;
            this.connection = 'trevobot-lr';
            this.queue = null;
            this.chainConnection = null;
            this.chainQueue = null;
            this.delay = null;
            this.chained = [];
        }
    }

    const job = new UpdateBotState(data);

    const serialized = serialize(job, {
        'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateBotState': UpdateBotState,
    });

    return {
        displayName: 'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateBotState',
        job: 'Illuminate\\Queue\\CallQueuedHandler@call',
        maxTries:null,
        delay: null,
        timeout: null,
        timeoutAt: null,
        data: {
            commandName: 'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateBotState',
            command: serialized
        },
        id: randomString(32),
        attempts: 0
    };
}

function generateQueuePayload(data) {
    class UpdateJobState {
        constructor(data) {
            this.data = data;
            this.job = null;
            this.connection = 'trevobot-lr';
            this.queue = null;
            this.chainConnection = null;
            this.chainQueue = null;
            this.delay = null;
            this.chained = [];
        }
    }

    const job = new UpdateJobState(data);

    const serialized = serialize(job, {
        'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateJobState': UpdateJobState,
    });

    return {
        displayName: 'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateJobState',
        job: 'Illuminate\\Queue\\CallQueuedHandler@call',
        maxTries:null,
        delay: null,
        timeout: null,
        timeoutAt: null,
        data: {
            commandName: 'App\\Infrastructure\\TrevoBot\\Jobs\\UpdateJobState',
            command: serialized
        },
        id: randomString(32),
        attempts: 0
    };
}


module.exports = {
    getContactId,
    retry,
    updateBotData,
    sleep,
    generateQueuePayload,
    pushToLaravelQueue,
    generateQueuePayloadForBot
}
