const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const classroomGradeBucket = process.env.ClassroomGradeBucket;


exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, functionName } = event;

    if (event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName, functionName } = JSON.parse(snsMessage.desc));
        }
        else {
            let { message, emailBody } = await common.getSesInboxMessage(event);
            classroomName = message.slots.classroomName;
            functionName = emailBody.split('\n')[0].trim();
        }
    }

    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomName = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomName
        }
    };

    let students = await dynamo.query(params).promise();
    console.log(students);
    console.log(classroomName);
    const awsAccountId = context.invokedFunctionArn.split(":")[4];
    const gradeClassroom = async(email, time) => {

        let studentAccount = await dynamo.get({
            TableName: studentAccountTable,
            Key: {
                'classroomName': classroomName,
                'email': email
            }
        }).promise();
        console.log(studentAccount);

        const sts = new AWS.STS();
        const token = await sts.assumeRole({
            RoleArn: `arn:aws:iam::${studentAccount.Item.awsAccountId}:role/crossaccountteacher${awsAccountId}`,
            RoleSessionName: 'studentAccount'
        }).promise();

        const eventArgs = {
            aws_access_key: token.Credentials.AccessKeyId,
            aws_secret_access_key: token.Credentials.SecretAccessKey,
            aws_session_token: token.Credentials.SessionToken,
        };

        params = {
            FunctionName: functionName,
            Payload: JSON.stringify(eventArgs),
            InvocationType: "RequestResponse",
        };

        const testResult = await lambda.invoke(params).promise();
        let testReport = JSON.parse(testResult.Payload).testResult;

        testReport = JSON.parse(testReport);
        testReport.classroomName = studentAccount.Item.classroomName;
        testReport.email = studentAccount.Item.email;
        testReport.gradeFunction = functionName;

        params = {
            Subject: studentAccount.Item.classroomName + " Project Mark on "+time+" with Grader " + functionName,
            Message: JSON.stringify(testReport),
            TopicArn: studentAccount.Item.notifyStudentTopic
        };
        const sns = new AWS.SNS({
            accessKeyId: token.Credentials.AccessKeyId,
            secretAccessKey: token.Credentials.SecretAccessKey,
            sessionToken: token.Credentials.SessionToken,
            region: "us-east-1"
        });
        const snsResult = await sns.publish(params).promise();
        console.log(snsResult);

        await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + email + "/" + time + ".json", testReport);
        return testReport;
    };

    console.log("Mark All Student Accounts.");
    const time = getFormattedTime();
    let rawResults = await Promise.all(students.Items.map(s => gradeClassroom(s.email, time)));
    const isEmpty = obj => Object.keys(obj).length === 0;

    const marks = rawResults
        .map(c => ({
            email: c.email,
            tests: c.tests.map(a => ({ test: a.fullTitle.trim(), pass: isEmpty(a.err) }))
        }));


    const results = {
        classroomName,
        gradeFunction: functionName,
        at: new Date(),
        marks
    };

    console.log(results);
    await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "classReport.json", results);
    await common.putJsonToS3(classroomGradeBucket, classroomName + "/" + functionName + "/" + "classReport" + time + ".json", results);
    return results;
};

const getFormattedTime = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const h = today.getHours();
    return y + "-" + m + "-" + d + "-" + h;
};
