import os
from backend.aws.aws_client import aws_manager, AWSMode

# Standard EC2 instance type capacity specifications (vCPU and GiB RAM)
INSTANCE_TYPE_SPECS = {
    "t2.nano":    {"vcpu": 1, "memory_gb": 0.5},
    "t2.micro":   {"vcpu": 1, "memory_gb": 1.0},
    "t2.small":   {"vcpu": 1, "memory_gb": 2.0},
    "t2.medium":  {"vcpu": 2, "memory_gb": 4.0},
    "t2.large":   {"vcpu": 2, "memory_gb": 8.0},
    "t2.xlarge":  {"vcpu": 4, "memory_gb": 16.0},
    "t2.2xlarge": {"vcpu": 8, "memory_gb": 32.0},

    "t3.nano":    {"vcpu": 2, "memory_gb": 0.5},
    "t3.micro":   {"vcpu": 2, "memory_gb": 1.0},
    "t3.small":   {"vcpu": 2, "memory_gb": 2.0},
    "t3.medium":  {"vcpu": 2, "memory_gb": 4.0},
    "t3.large":   {"vcpu": 2, "memory_gb": 8.0},
    "t3.xlarge":  {"vcpu": 4, "memory_gb": 16.0},
    "t3.2xlarge": {"vcpu": 8, "memory_gb": 32.0},

    "t4g.nano":   {"vcpu": 2, "memory_gb": 0.5},
    "t4g.micro":  {"vcpu": 2, "memory_gb": 1.0},
    "t4g.small":  {"vcpu": 2, "memory_gb": 2.0},
    "t4g.medium": {"vcpu": 2, "memory_gb": 4.0},
    "t4g.large":  {"vcpu": 2, "memory_gb": 8.0},
    "t4g.xlarge": {"vcpu": 4, "memory_gb": 16.0},

    "m5.large":   {"vcpu": 2, "memory_gb": 8.0},
    "m5.xlarge":  {"vcpu": 4, "memory_gb": 16.0},
    "m5.2xlarge": {"vcpu": 8, "memory_gb": 32.0},
    "m5.4xlarge": {"vcpu": 16, "memory_gb": 64.0},

    "c5.large":   {"vcpu": 2, "memory_gb": 4.0},
    "c5.xlarge":  {"vcpu": 4, "memory_gb": 8.0},
    "c5.2xlarge": {"vcpu": 8, "memory_gb": 16.0},
    "c5.4xlarge": {"vcpu": 16, "memory_gb": 32.0},

    "r5.large":   {"vcpu": 2, "memory_gb": 16.0},
    "r5.xlarge":  {"vcpu": 4, "memory_gb": 32.0},
    "r5.2xlarge": {"vcpu": 8, "memory_gb": 64.0},
}

class EC2Adapter:
    def __init__(self):
        self.ec2 = None

    def _get_client(self):
        if not self.ec2:
            self.ec2 = aws_manager.get_session().client('ec2')
        return self.ec2

    def discover_instances(self, tag_key=None, tag_value=None):
        """
        Discovers EC2 instances in the configured region.
        Filters instances using tag:CloudPilot-Managed = true (or environment config).
        Returns instance details including vCPU and memory capacity.
        READ_ONLY operation using describe_instances.
        """
        if tag_key is None:
            tag_key = os.environ.get("EC2_TAG_FILTER_KEY", "CloudPilot-Managed")
        if tag_value is None:
            tag_value = os.environ.get("EC2_TAG_FILTER_VALUE", "true")

        try:
            client = self._get_client()
            
            # Apply tag filter if tag_key and tag_value are provided
            filters = []
            if tag_key and tag_value:
                filters.append({"Name": f"tag:{tag_key}", "Values": [tag_value]})

            response = client.describe_instances(Filters=filters) if filters else client.describe_instances()
            
            instances = []
            for reservation in response.get("Reservations", []):
                for inst in reservation.get("Instances", []):
                    inst_id = inst.get("InstanceId")
                    inst_type = inst.get("InstanceType", "unknown")
                    state = inst.get("State", {}).get("Name", "unknown")
                    az = inst.get("Placement", {}).get("AvailabilityZone", "")
                    tags = inst.get("Tags", [])

                    # Extract tags
                    name_tag = inst_id
                    managed_tag = "false"
                    for t in tags:
                        if t.get("Key") == "Name":
                            name_tag = t.get("Value", inst_id)
                        if t.get("Key") == tag_key:
                            managed_tag = t.get("Value", "false")

                    # Capacity resolution
                    specs = INSTANCE_TYPE_SPECS.get(inst_type, {"vcpu": 2, "memory_gb": 1.0})
                    vcpu = specs["vcpu"]
                    memory_gb = float(specs["memory_gb"])

                    instances.append({
                        "id": inst_id,
                        "type": inst_type,
                        "state": state,
                        "az": az,
                        "name": name_tag,
                        "cloudpilot_managed": managed_tag,
                        "vcpu": vcpu,
                        "memory_gb": memory_gb,
                        "capacity": f"{vcpu} vCPU, {memory_gb} GB RAM",
                        "tags": tags,
                        "is_aws": True,
                    })

            return instances
        except Exception as e:
            print(f"[EC2Adapter ERROR] discover_instances failed: {e}")
            return []

    def execute_action(self, action, instance_id):
        """
        Execute an AWS action.
        Under READ_ONLY / DRY_RUN mode, this NEVER executes mutating API calls.
        """
        return {
            "status": "DRY_RUN",
            "action": action,
            "instance": instance_id,
            "mode": aws_manager.mode,
            "reason": f"System is operating in {aws_manager.mode} mode. No EC2 instances are modified or stopped."
        }

ec2_adapter = EC2Adapter()
