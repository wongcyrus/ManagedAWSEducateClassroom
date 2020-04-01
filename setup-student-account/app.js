const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const extractKeys = rawKey => {
    const accessKeyStartIndex = rawKey.indexOf("aws_access_key_id=") + "aws_access_key_id=".length;
    const accessKeyId = rawKey.substring(accessKeyStartIndex, rawKey.indexOf("aws_secret_access_key=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretKeyStartIndex = rawKey.indexOf("aws_secret_access_key=") + "aws_secret_access_key=".length;
    const secretAccessKey = rawKey.substring(secretKeyStartIndex, rawKey.indexOf("aws_session_token=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretSessionTokenIndex = rawKey.indexOf("aws_session_token=") + "aws_session_token=".length;
    const sessionToken = rawKey.substring(secretSessionTokenIndex, secretSessionTokenIndex + 368).replace(/(\r\n|\n|\r)/gm, "");
    return { accessKeyId, secretAccessKey, sessionToken };
};

const getS3File = async(bucket, key) => {
    const params = {
        Bucket: bucket,
        Key: key
    };
    const response = await s3.getObject(params).promise();
    return response.Body.toString();
};

const initStudentAccount = async(email, rawKey) => {
    let sts = new AWS.STS();
    const { Account } = await sts.getCallerIdentity().promise();
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
        StackName: 'ManagedAWSEduateClassroom',
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM",
        ],
        Parameters: [{
            ParameterKey: 'TeacherAccountId',
            ParameterValue: Account
        }, {
            ParameterKey: 'StudentEmail',
            ParameterValue: email
        }],
        TemplateBody: template
    };
    let response = await cloudformation.createStack(params).promise();

    params = {
        StackName: 'ManagedAWSEduateClassroom'
    };
    await cloudformation.waitFor('stackCreateComplete', params).promise();
    response = await cloudformation.describeStacks(params).promise();
    let labStackCreationCompleteTopic = response.Stacks[0].Outputs
        .find(c => c.OutputKey === "SNSTopicCloudFormation").OutputValue;

    let result = await dynamo.put({
        "TableName": studentAccountTable,
        "Item": {
            "id": email,
            "studentAccountArn": studentAcocuntIdentity.Arn,
            "awsAccountId": studentAcocuntIdentity.Account,
            "labStackCreationCompleteTopic": labStackCreationCompleteTopic
        }
    }).promise();
    console.log(result);
};

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    if (event.Records) {
        let message = JSON.parse((JSON.parse(event.Records[0].body)).Message);
        console.log(message);
        let { inboxBucket, trimedEmailJson } = message;
        const trimedEmailJsonContent = await getS3File(inboxBucket,trimedEmailJson);
        const emailBody = JSON.parse(trimedEmailJsonContent).content;
        console.log(emailBody);
        await initStudentAccount(message.sender, emailBody);
    }
    await initStudentAccount(event.email, event.key);
    return "OK";
};
