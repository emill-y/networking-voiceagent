from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base for API models: snake_case in Python, camelCase in JSON.

    The mobile app is TypeScript, where camelCase is idiomatic, so the
    JSON uses camelCase while Python code keeps snake_case.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
