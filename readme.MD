This project uses bee-queue to process messages and the manager commands.

Create a docker instance

    docker run -d -p 6379:6379 --name container-redis redis

Install packages

    npm install

Start manager
    
    pm2 start manager.js

Create a bot

    const Queue = require('bee-queue');
    const queue = new Queue('bot-process');
    
    queue.createJob({
        type: 'start',
        id  : 1
    })
    .save();
