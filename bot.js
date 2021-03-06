const Queue = require('bee-queue');
const redis = require('redis');
const { Client, MessageMedia} = require('whatsapp-web.js');
const { getContactId, updateBotData, sleep, generateQueuePayload, pushToLaravelQueue, generateQueuePayloadForBot} = require('./utils');

const botId = `${process.argv[2]}`;
const redisClient = redis.createClient();
const queueName = `bot-${botId}`;
const queue = new Queue(queueName, {
    activateDelayedJobs: true
});
let session;
let ping;
let checkBrowserInterval;
const pupArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // <- this one doesn't works in Windows
    '--disable-gpu'
];

(async () => {
    await redisClient.connect();

    await updateBotData(botId, redisClient,  (data) =>
        Object.assign({}, data, { status: 1 })
    , true);

    const redisSession = await redisClient.hGet(`bot-sessions`, botId);

    if (redisSession !== null) {
        session = JSON.parse(redisSession);
    }

    const client = new Client({ puppeteer: { args: pupArgs, headless: true }, session: session });

    client.on('authenticated', async (session) => {
        await redisClient.hDel(`bot-sessions`, botId);
        await redisClient.sendCommand(['HSET', 'bot-sessions', botId, JSON.stringify(session)]);
    });

    client.on('auth_failure', async msg => {
        await redisClient.hDel(`bot-sessions`, botId);

        process.removeListener('SIGINT', exitListener);
        exitListener('SIGINT');
        process.exit(0);
    });

    client.on('disconnected', async (reason) => {
        if (reason === 'NAVIGATION') {
            await redisClient.hDel(`bot-sessions`, botId);
        }

        process.removeListener('SIGINT', exitListener);
        exitListener('SIGINT');
        process.exit(0);
    });

    client.on('ready', async () => {
        await updateBotData(botId, redisClient, (data) =>
            Object.assign({}, data, { status: 3 })
        , true);

        queue.on('succeeded', async (job, result) => {
            await pushToLaravelQueue(redisClient, generateQueuePayload({ job_id: `${job.id}`, result }));
        });

        queue.process(async (job) => {
            console.log(`Receiving job: ${job.id}, type: ${job.data.type}, to: ${job.data.number}`);
            switch (job.data.type) {
                // case 'check-number':
                //     return await getContactId(client, job.data.number);
                case 'send-chat':
                    const number = await getContactId(client, job.data.number);
                    if (!number) {
                        return false;
                    }

                    await client.interface.openChatWindow(number);
                    await client.sendPresenceAvailable();
                    const chat = await client.getChatById(number);
                    await chat.sendStateTyping();
                    let result;

                    if (job.data.image) {
                        result = await client.sendMessage(number, new MessageMedia('image/png', job.data.image), {caption: job.data.text});
                    } else {
                        result = await client.sendMessage(number, job.data.text);
                    }

                    await sleep(1500);

                    console.log(`The message sent to ${job.data.number} was processed with result:`, result);

                    return true;
            }

            return false;
        });
    });

    client.initialize();

    checkBrowserInterval = setInterval(() => {
        if (client.pupBrowser !== null) {
            clearInterval(checkBrowserInterval);
            ping = setInterval(async () => {
                if (!client || !client.pupPage || client.pupPage.isClosed()) {
                    if (ping) {
                        clearInterval(ping);
                    }

                    return false;
                }

                let base64;

                try {
                    base64 = await client.pupPage.screenshot({quality: 50, type: "jpeg", encoding: "base64"})
                } catch (e) {
                    clearInterval(ping);
                    return;
                }

                await updateBotData(botId, redisClient,  (data) =>
                    Object.assign({}, data, {
                        screenAt: Date.now(),
                        screen: base64
                    })
                , false);
            }, 2200);
        }
    }, 400);
})();

const listener = function () {
    return new Promise(async function (resolve, reject) {
        if (queue && queue.isRunning()) {
            await queue.close();
        }

        if (redisClient && redisClient.isOpen) {
            await updateBotData(botId, redisClient, data =>
                Object.assign({}, data, { status: 0 })
            , true);

            await redisClient.disconnect();
        }
        resolve();
    });
};

const originalProcessExit = process.exit;

const restoreProcessExit = (code) => {
    process.exit = originalProcessExit;
    process.exit(code);
}

const exitListener = function (signalOrEvent) {
    process.exit = function() {
        try {
            Promise.resolve(listener(signalOrEvent)).then(function () {
                restoreProcessExit(0);
            }).catch(function (err) {
                console.error('async-on-exit: Listener returned an error:', err.stack);
                restoreProcessExit(1);
            });
        } catch (err) {
            console.error('async-on-exit: Listener returned an error:', err.stack);
            restoreProcessExit(1);
        }
    }
};

process.on('SIGINT', exitListener);
