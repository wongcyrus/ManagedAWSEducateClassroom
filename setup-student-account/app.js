const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;

const dynamo = new AWS.DynamoDB.DocumentClient();
const common = require('/opt/common');

const extractKeys = rawKey => {
    const accessKeyStartIndex = rawKey.indexOf("aws_access_key_id=") + "aws_access_key_id=".length;
    const accessKeyId = rawKey.substring(accessKeyStartIndex, rawKey.indexOf("aws_secret_access_key=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretKeyStartIndex = rawKey.indexOf("aws_secret_access_key=") + "aws_secret_access_key=".length;
    const secretAccessKey = rawKey.substring(secretKeyStartIndex, rawKey.indexOf("aws_session_token=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretSessionTokenIndex = rawKey.indexOf("aws_session_token=") + "aws_session_token=".length;

    let secretSessionTokenEndIndex = rawKey.indexOf("\r", secretSessionTokenIndex);
    if (secretSessionTokenEndIndex === -1) secretSessionTokenEndIndex = rawKey.length;

    const sessionToken = rawKey.substring(secretSessionTokenIndex, secretSessionTokenEndIndex).replace(/(\r\n|\n|\r)/gm, "");
    console.log({ accessKeyId, secretAccessKey, sessionToken });
    return { accessKeyId, secretAccessKey, sessionToken };
};

const initStudentAccount = async(classroomName, email, rawKey) => {
    let sts = new AWS.STS();
    const account = (await sts.getCallerIdentity().promise()).Account;
    const { accessKeyId, secretAccessKey, sessionToken } = extractKeys(rawKey);

    sts = new AWS.STS({ accessKeyId, secretAccessKey, sessionToken });
    const studentAcocuntIdentity = await sts.getCallerIdentity().promise();
    const template = fs.readFileSync("InitStudentAccount.yaml", "utf8");
    const cloudformation = new AWS.CloudFormation({
        accessKeyId,
        secretAccessKey,
        sessionToken,
        region: "us-east-1"
    });
    let params = {
        StackName: 'ManagedAWSEduateClassroom-' + account,
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM",
        ],
        Parameters: [{
            ParameterKey: 'TeacherAccountId',
            ParameterValue: account
        }, {
            ParameterKey: 'StudentEmail',
            ParameterValue: email
        }],
        TemplateBody: template
    };
    let response = await cloudformation.createStack(params).promise();

    params = {
        StackName: 'ManagedAWSEduateClassroom-' + account
    };
    await cloudformation.waitFor('stackCreateComplete', params).promise();
    response = await cloudformation.describeStacks(params).promise();
    let labStackCreationCompleteTopic = response.Stacks[0].Outputs
        .find(c => c.OutputKey === "SNSCloudFormationTopic").OutputValue;

    let notifyStudentTopic = response.Stacks[0].Outputs
        .find(c => c.OutputKey === "NotifyStudentTopic").OutputValue;
    console.log(classroomName, email, rawKey);


    const ec2 = new AWS.EC2({
        accessKeyId,
        secretAccessKey,
        sessionToken,
        region: "us-east-1"
    });

    try {
        await ec2.deleteKeyPair({
            KeyName: classroomName + "-" + account + "-" + email
        }).promise();
    }
    catch (err) { console.error(err); }

    let keyResponse = await ec2.createKeyPair({
        KeyName: classroomName + "-" + account + "-" + email
    }).promise();

    let keyPair = JSON.stringify(keyResponse);

    let result = await dynamo.put({
        "TableName": studentAccountTable,
        "Item": {
            "classroomName": classroomName,
            "email": email,
            "studentAccountArn": studentAcocuntIdentity.Arn,
            "awsAccountId": studentAcocuntIdentity.Account,
            "labStackCreationCompleteTopic": labStackCreationCompleteTopic,
            "notifyStudentTopic": notifyStudentTopic,
            "keyPair": keyPair
        }
    }).promise();
    return result;
};


exports.lambdaHandler = async(event, context) => {
    let { classroomName, email, rawKey } = event;
    console.log(event);
    if (event.Records) {
        let { message, emailBody } = await common.getSesInboxMessage(event);
        console.log(message);
        console.log(emailBody);

        classroomName = message.slots.classroomName;
        email = message.sender;
        rawKey = emailBody;
    }
    return initStudentAccount(classroomName, email, rawKey);
};
