require('dotenv').config();
const express = require('express');
const {generateSlug} = require('random-word-slugs')
const {ECSClient,RunTaskCommand} = require('@aws-sdk/client-ecs')
const {Server} = require('socket.io')
const redis = require('ioredis');

const app = express();
const PORT = 9000;

const subscriber = new redis(`rediss://default:${process.env.AIVEN_KEY}@caching-23b0ae83-deployit.h.aivencloud.com:17507`)

const io = new Server({cors: '*'})

io.on('connection',socket=>{
    socket.on('subscribe',channel=>{
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9001,()=>console.log('Socket server running on port 9001'))

const ecsClient = new ECSClient({
    region:'ap-south-1',
    credentials:{
        accessKeyId: process.env.ACCESS_ID,
        secretAccessKey: process.env.SECRET_KEY
    }
});

const config = {
    CLUSTER: `arn:aws:ecs:ap-south-1:${process.env.CLUSTER_ID}:cluster/builder-cluster`,
    TASK: `arn:aws:ecs:ap-south-1:${process.env.CLUSTER_ID}:task-definition/builder-task`
}

app.use(express.json());

app.post('/project', async(req,res)=>{
    const {gitUrl,slug} = req.body;
    const projectSlug =slug || generateSlug();

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: "FARGATE",
        count: 1,
        networkConfiguration:{
            awsvpcConfiguration:{
                assignPublicIp: "ENABLED",
                subnets: ["subnet-","subnet-","subnet-"],
                securityGroups:['sg-']
            }
        },
        overrides:{
            containerOverrides:[
                {
                    name: 'builder-image',
                    environment:[
                        {
                            name: 'GIT_REPOSITORY__URL',
                            value: gitUrl
                        },
                        {
                            name: 'PROJECT_ID',
                            value: projectSlug
                        }
                    ]
                }
            ]
        }
    })

    try{
        await ecsClient.send(command);
        return res.json({
            status:'queued',
            data:{
                projectSlug,
                url:`http://${projectSlug}.localhost:8000`
            }
        })

    }catch(error){
        return res.status(500).json({message: error.message})
    }


})

async function initRedisSubscribe(){
    console.log('Subscribing to logs');
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage',(pattern,channel,message)=>{
        io.to(channel).emit('message',message)
    })
}

initRedisSubscribe();

app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
})