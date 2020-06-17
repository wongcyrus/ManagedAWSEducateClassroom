const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const querystring = require('querystring');
const setupStudentAccountFunctionArn = process.env.SetupStudentAccountFunction;

const encodedStr = rawStr => rawStr.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
    return '&#' + i.charCodeAt(0) + ';';
});

exports.lambdaHandler = async(event, context) => {

    console.log(event);
    if (event.requestContext.http.method === "GET") {
        if (!event.queryStringParameters || !event.queryStringParameters.classroomName) {
            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration - Error</title>
    </head>
    <body>
        <h2>Invalid Url and it must have classroomName.</h2>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `
            };
        }
        else {
            let classroomName = encodedStr(event.queryStringParameters.classroomName);
            let studentEmail = "";
            if (event.queryStringParameters.studentEmail)
                studentEmail = event.queryStringParameters.studentEmail.toLowerCase();
            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration</title>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Student Account Registration - ${classroomName}</h2>
        <form method="POST" action="/">
            <input type="hidden" id="classroomName" name="classroomName" value="${classroomName}">
            <label for="Email">Email:</label><br>
            <input type="email" id="email" name="email" size="50" value="${studentEmail}" required><br>
            <label for="credentials">Credentials:</label><br>
            <textarea id="rawKey" name="rawKey" rows="10" cols="100" required></textarea><br>
          <input type="submit" value="Submit">
        </form> 
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
            };
        }
    }
    else if (event.requestContext.http.method === "POST" && event.isBase64Encoded) {
        const buff = Buffer.from(event.body, 'base64');
        const body = buff.toString('ascii');
        const parameters = querystring.parse(body);
        console.log(parameters);

        console.log(typeof parameters.rawKey);
        console.log(parameters.rawKey.replace(/(\r\n|\n|\r)/gm, ""));
        parameters.rawKey = parameters.rawKey.replace(/(\r\n|\n|\r)/gm, "");
        console.log(parameters);

        let params = {
            FunctionName: setupStudentAccountFunctionArn,
            InvokeArgs: JSON.stringify(parameters)
        };
        console.log(await lambda.invokeAsync(params).promise());

        return {
            "headers": {
                "Content-Type": "text/html"
            },
            "statusCode": 200,
            "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration - Completed</title>
    </head>
    <body>
        <h2>Please check your email inbox after 5 minutes and confirm the SNS topic subscription.</h2>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
        };
    }


};
