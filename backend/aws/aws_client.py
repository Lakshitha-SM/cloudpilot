import os
import boto3
from botocore.exceptions import NoCredentialsError, PartialCredentialsError

class AWSMode:
    READ_ONLY = "READ_ONLY"
    DECISION_ONLY = "DECISION_ONLY"
    CONTROLLED_EXECUTION = "CONTROLLED_EXECUTION"

class AWSClientManager:
    def __init__(self):
        self.mode = os.environ.get("CLOUDPILOT_AWS_MODE", AWSMode.READ_ONLY)
        self.region = os.environ.get("AWS_REGION", "us-east-1")
        self._session = None

    def get_session(self):
        if not self._session:
            self._session = boto3.Session(region_name=self.region)
        return self._session

    def check_connection(self):
        try:
            sts = self.get_session().client('sts')
            identity = sts.get_caller_identity()
            return {
                "status": "CONNECTED",
                "account": identity.get("Account"),
                "arn": identity.get("Arn"),
                "userId": identity.get("UserId"),
                "mode": self.mode,
                "region": self.region,
                "read_only": True,
            }
        except (NoCredentialsError, PartialCredentialsError):
            return {
                "status": "DISCONNECTED",
                "error": "AWS credentials not found",
                "mode": self.mode,
                "region": self.region,
                "read_only": True,
            }
        except Exception as e:
            return {
                "status": "DISCONNECTED",
                "error": str(e),
                "mode": self.mode,
                "region": self.region,
                "read_only": True,
            }

aws_manager = AWSClientManager()
