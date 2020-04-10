const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const studentAccountTable = process.env.StudentAccountTable;


const startStudentInstance = async(param) => {
    const { roleArn, stackName, notifyStudentTopic } = param;
    const sts = new AWS.STS();
    const token = await sts.assumeRole({
        RoleArn: roleArn,
        RoleSessionName: 'studentAccount'
    }).promise();

    const credential = {
        accessKeyId: token.Credentials.AccessKeyId,
        secretAccessKey: token.Credentials.SecretAccessKey,
        sessionToken: token.Credentials.SessionToken,
        region: "us-east-1"
    };

    const cloudformation = new AWS.CloudFormation(credential);

    let response = await cloudformation.describeStackResources({
        StackName: stackName
    }).promise();
    const instanceIds = response.StackResources.filter(c => c.ResourceType === "AWS::EC2::Instance").map(c => c.PhysicalResourceId);
    console.log(instanceIds);

    if (instanceIds.length === 0) return;

    const ec2 = new AWS.EC2(credential);

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

    const sns = new AWS.SNS(credential);
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

    const awsAccountId = context.invokedFunctionArn.split(":")[4];
    const param = {
        stackName,
        roleArn: `arn:aws:iam::${studentAccount.Item.awsAccountId}:role/crossaccountteacher${awsAccountId}`,
        notifyStudentTopic: studentAccount.Item.notifyStudentTopic
    };
    await startStudentInstance(param);
    return "OK";
};
