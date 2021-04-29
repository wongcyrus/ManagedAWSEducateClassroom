const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const querystring = require('querystring');
const axios = require('axios');
const setupStudentAccountFunctionArn = process.env.SetupStudentAccountFunction;
const recaptchaSiteKey = process.env.RecaptchaSiteKey;
const recaptchaSercetKey = process.env.RecaptchaSercetKey;

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
            let recaptcha = '<input type="submit" value="Submit">';
            if (recaptchaSiteKey !== "") {
                recaptcha = `
<script>
   function onSubmit(token) {
     document.getElementById("keyform").submit();
   }
    grecaptcha.ready(function() {
    // do request for recaptcha token
    // response is promise with passed token
        grecaptcha.execute('${recaptchaSiteKey}', {action:'validate_captcha'})
                  .then(function(token) {
            // add token value to form
            document.getElementById('g-recaptcha-response').value = token;
        });
    });   
</script>
<button class="g-recaptcha" 
        data-sitekey="${recaptchaSiteKey}" 
        data-callback='onSubmit' 
        data-action='submit'>Submit</button>
`;
            }

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
        <script src="https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}"></script>
        <meta charset="utf-8"/>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Student Account Registration - ${classroomName}</h2>
        <form id="keyform" method="POST" action="/">
            <input type="hidden" id="g-recaptcha-response" name="g-recaptcha-response">
            <input type="hidden" name="action" value="validate_captcha">
            <input type="hidden" id="classroomName" name="classroomName" value="${classroomName}">
            <label for="Email">Email:</label><br>
            <input type="email" id="email" name="email" size="50" value="${studentEmail}" required><br>
            For AWS Educate Classroom, you need to provide the Credentials.<br>
            <label for="credentials">Credentials:</label><br>
            <textarea id="rawKey" name="rawKey" rows="10" cols="100"></textarea><br>
            For AWS Academy Learner Lab Associate, you need to provide access key pair.<br>
            <label for="AccessKey">Access Key:</label><br>
            <input type="text" id="accessKey" name="accessKey" size="50"><br>            
            <label for="SecretKey">Secret Key:</label><br>
            <input type="text" id="secretKey" name="secretKey" size="50"><br>            
            ${recaptcha}
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
        if (recaptchaSercetKey !== "") {
            const token = parameters["g-recaptcha-response"][0];
            let verifyResult = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSercetKey}&response=${token}`);

            console.log(verifyResult);
            if (verifyResult.status !== 200 || !verifyResult.data.success) {
                return {
                    "headers": {
                        "Content-Type": "text/html"
                    },
                    "statusCode": 200,
                    "body": "recaptcha error!",
                };
            }
        }

        const isNullOrEmpty = value => (!value || value == undefined || value == "" || value.length == 0);

        if (!isNullOrEmpty(parameters.rawKey)) {
            console.log(typeof parameters.rawKey);
            console.log(parameters.rawKey.replace(/(\r\n|\n|\r)/gm, ""));
            parameters.rawKey = parameters.rawKey.replace(/(\r\n|\n|\r)/gm, "");
        }
        else if (!isNullOrEmpty(parameters.accessKey) && !isNullOrEmpty(parameters.secretKey)) {
            console.log("AWS Academy Learner Lab");
        }
        else {
            return {
                "headers": {
                    "Content-Type": "text/html"
                },
                "statusCode": 200,
                "body": "You need to provide AWS Educate Classroom Raw Key or AWS Academy Learner Lab Key Pair!",
            };
        }

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
