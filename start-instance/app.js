const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const studentAccountTable = process.env.StudentAccountTable;
const common = require('/opt/nodejs/common');


const startStudentInstance = async(param) => {
    const { stackName, notifyStudentTopic, keyProviderUrl } = param;
    const credentials = await common.getCredentials(keyProviderUrl);

    const cloudformation = new AWS.CloudFormation(credentials);

    let response = await cloudformation.describeStackResources({
        StackName: stackName
    }).promise();
    const instanceIds = response.StackResources.filter(c => c.ResourceType === "AWS::EC2::Instance").map(c => c.PhysicalResourceId);
    console.log(instanceIds);

    if (instanceIds.length === 0) return;

    const ec2 = new AWS.EC2(credentials);

    response = await ec2.startInstances({
        InstanceIds: instanceIds
    }).promise();
    console.log(response);

    response = await ec2.waitFor("instanceRunning", {
        InstanceIds: instanceIds
    }).promise();
    console.log(response);
    response = await ec2.describeInstances({
        InstanceIds: instanceIds
    }).promise();

    const messages = response.Reservations[0].Instances.map(c => {
        return {
            PublicDnsName: c.PublicDnsName,
            Tags: c.Tags
        };
    });

    console.log(JSON.stringify(messages));

    const sns = new AWS.SNS(credentials);
    response = await sns.publish({
        Subject: "Running EC2 Instances for " + stackName,
        Message: JSON.stringify(messages),
        TopicArn: notifyStudentTopic
    }).promise();
    console.log(response);
};

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, stackName, email } = event;

    let studentAccount = await dynamo.get({
        TableName: studentAccountTable,
        Key: {
            'classroomName': classroomName,
            'email': email
        }
    }).promise();
    console.log(studentAccount);

    const param = {
        stackName,
        notifyStudentTopic: studentAccount.Item.notifyStudentTopic,
        keyProviderUrl: studentAccount.Item.keyProviderUrl
    };
    await startStudentInstance(param);
    return "OK";
};
