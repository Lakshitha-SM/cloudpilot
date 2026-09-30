import datetime
from datetime import timezone
from backend.aws.aws_client import aws_manager

class CloudWatchAdapter:
    def __init__(self):
        self.cw = None

    def _get_client(self):
        if not self.cw:
            self.cw = aws_manager.get_session().client('cloudwatch')
        return self.cw

    def discover_metric_dimensions(self, instance_id: str, metric_name: str, namespace: str = "CloudPilot/EC2"):
        """
        Discovers dimensions for a specific metric and instance using ListMetrics.
        For disk, looks for path=/.
        Returns a list of dimensions dictionaries.
        """
        client = self._get_client()
        try:
            # We want metrics that have InstanceId = instance_id
            response = client.list_metrics(
                Namespace=namespace,
                MetricName=metric_name,
                Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}]
            )
            metrics = response.get('Metrics', [])
            
            if not metrics:
                return []
                
            # If disk metric, prefer one with path='/'
            if 'disk' in metric_name:
                for m in metrics:
                    dims = m.get('Dimensions', [])
                    for d in dims:
                        if d['Name'] == 'path' and d['Value'] == '/':
                            return dims
            
            # For network or others, just return the first match's dimensions
            return metrics[0].get('Dimensions', [])
            
        except Exception as e:
            print(f"Error discovering dimensions for {metric_name}: {e}")
            return []

    def get_metrics(self, instance_id: str, instance_type: str = "t3.micro", minutes: int = 15, period: int = 60):
        """
        Retrieves telemetry for instance_id using GetMetricData.
        Returns structured data with data_source = AWS_CLOUDWATCH.
        """
        if not instance_id:
            return {
                "status": "ERROR",
                "instance_id": instance_id,
                "error": "instance_id is required",
                "data_source": "AWS_CLOUDWATCH",
            }

        try:
            client = self._get_client()
            end_time = datetime.datetime.now(timezone.utc)
            start_time = end_time - datetime.timedelta(minutes=minutes)
            
            # Discover dynamic dimensions
            disk_used_dims = self.discover_metric_dimensions(instance_id, "disk_used_percent")
            net_recv_dims = self.discover_metric_dimensions(instance_id, "net_bytes_recv")
            net_sent_dims = self.discover_metric_dimensions(instance_id, "net_bytes_sent")
            disk_read_dims = self.discover_metric_dimensions(instance_id, "diskio_read_bytes")
            disk_write_dims = self.discover_metric_dimensions(instance_id, "diskio_write_bytes")

            # Fallbacks if discovery fails or metrics don't exist yet
            if not disk_used_dims:
                disk_used_dims = [
                    {"Name": "InstanceId", "Value": instance_id},
                    {"Name": "InstanceType", "Value": instance_type},
                    {"Name": "path", "Value": "/"},
                    {"Name": "device", "Value": "nvme0n1p1"},
                    {"Name": "fstype", "Value": "xfs"}
                ]
            if not net_recv_dims:
                net_recv_dims = [
                    {"Name": "InstanceId", "Value": instance_id},
                    {"Name": "InstanceType", "Value": instance_type},
                    {"Name": "interface", "Value": "ens5"}
                ]
            if not net_sent_dims:
                net_sent_dims = [
                    {"Name": "InstanceId", "Value": instance_id},
                    {"Name": "InstanceType", "Value": instance_type},
                    {"Name": "interface", "Value": "ens5"}
                ]
            if not disk_read_dims:
                disk_read_dims = [
                    {"Name": "InstanceId", "Value": instance_id}
                ]
            if not disk_write_dims:
                disk_write_dims = [
                    {"Name": "InstanceId", "Value": instance_id}
                ]

            queries = [
                {
                    "Id": "cpu_utilization",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/EC2",
                            "MetricName": "CPUUtilization",
                            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}]
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": "Percent"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "memory_used_percent",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "mem_used_percent",
                            "Dimensions": [
                                {"Name": "InstanceId", "Value": instance_id},
                                {"Name": "InstanceType", "Value": instance_type}
                            ]
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": "Percent"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "memory_available_percent",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "mem_available_percent",
                            "Dimensions": [
                                {"Name": "InstanceId", "Value": instance_id},
                                {"Name": "InstanceType", "Value": instance_type}
                            ]
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": "Percent"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "disk_used_percent",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "disk_used_percent",
                            "Dimensions": disk_used_dims
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": "Percent"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "network_bytes_received",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "net_bytes_recv",
                            "Dimensions": net_recv_dims
                        },
                        "Period": period,
                        "Stat": "Sum",
                        "Unit": "Bytes"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "network_bytes_sent",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "net_bytes_sent",
                            "Dimensions": net_sent_dims
                        },
                        "Period": period,
                        "Stat": "Sum",
                        "Unit": "Bytes"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "disk_read_bytes",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "diskio_read_bytes",
                            "Dimensions": disk_read_dims
                        },
                        "Period": period,
                        "Stat": "Sum",
                        "Unit": "Bytes"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "disk_write_bytes",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "diskio_write_bytes",
                            "Dimensions": disk_write_dims
                        },
                        "Period": period,
                        "Stat": "Sum",
                        "Unit": "Bytes"
                    },
                    "ReturnData": True
                },
                {
                    "Id": "swap_used_percent",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "CloudPilot/EC2",
                            "MetricName": "swap_used_percent",
                            "Dimensions": [
                                {"Name": "InstanceId", "Value": instance_id},
                                {"Name": "InstanceType", "Value": instance_type}
                            ]
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": "Percent"
                    },
                    "ReturnData": True
                }
            ]

            response = client.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start_time,
                EndTime=end_time,
                ScanBy="TimestampDescending"
            )

            results = response.get("MetricDataResults", [])
            
            metrics_dict = {}
            for res in results:
                m_id = res["Id"]
                metrics_dict[m_id] = {
                    "timestamps": res.get("Timestamps", []),
                    "values": res.get("Values", [])
                }

            cpu_data = metrics_dict.get("cpu_utilization", {})
            if not cpu_data.get("values"):
                return {
                    "status": "NO_RECENT_DATAPOINT",
                    "instance_id": instance_id,
                    "data_source": "AWS_CLOUDWATCH",
                    "error": f"No CloudWatch CPU datapoints available for {instance_id} in the last {minutes} minutes"
                }

            current = {}
            datapoints = {}
            latest_ts = None
            
            for m_id, m_data in metrics_dict.items():
                timestamps = m_data["timestamps"]
                values = m_data["values"]
                
                pts = []
                for ts, val in zip(timestamps, values):
                    pts.append({
                        "timestamp": ts.isoformat(),
                        "value": round(float(val), 4)
                    })
                
                pts.sort(key=lambda x: x["timestamp"], reverse=True)
                
                datapoints[m_id] = pts
                
                if pts:
                    current[m_id] = pts[0]["value"]
                    if latest_ts is None or pts[0]["timestamp"] > latest_ts:
                        latest_ts = pts[0]["timestamp"]
                else:
                    current[m_id] = None

            return {
                "status": "OK",
                "instance_id": instance_id,
                "data_source": "AWS_CLOUDWATCH",
                "current": current,
                "datapoints": datapoints,
                "timestamp": latest_ts
            }

        except Exception as e:
            return {
                "status": "ERROR",
                "instance_id": instance_id,
                "data_source": "AWS_CLOUDWATCH",
                "error": str(e)
            }

cloudwatch_adapter = CloudWatchAdapter()
