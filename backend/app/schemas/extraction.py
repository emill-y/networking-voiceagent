from datetime import date

from pydantic import Field

from app.schemas.base import ApiModel


class ExtractedPerson(ApiModel):
    name: str | None = None
    # Sessions: when their name was never said, a few words to recognize them by.
    label: str | None = None
    company: str | None = None
    role: str | None = None
    school: str | None = None
    major: str | None = None
    met_at: str | None = None
    location: str | None = None
    interests: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    needs: list[str] = Field(default_factory=list)
    topics_discussed: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    # Sessions: the conversation with this person, as detailed notes in order.
    conversation: list[str] = Field(default_factory=list)
    follow_up: str | None = None
    # Resolved by the backend from follow_up's wording, not by the model.
    follow_up_due: date | None = None


class ContactExtractionResult(ApiModel):
    people: list[ExtractedPerson] = Field(default_factory=list)


class SpeakerContext(ApiModel):
    """Who's speaking, so "my school" or "a classmate" can be understood."""

    persona: str | None = Field(default=None, max_length=40)
    school: str | None = Field(default=None, max_length=200)
    major: str | None = Field(default=None, max_length=200)


class ExtractionRequest(ApiModel):
    transcript: str = Field(min_length=1, max_length=20_000)
    # The user's local date, so "next week" means their next week.
    today: date | None = None
    context: SpeakerContext | None = None


def _nullable_string(description: str) -> dict:
    return {"type": ["string", "null"], "description": description}


def _string_list(description: str) -> dict:
    return {"type": "array", "items": {"type": "string"}, "description": description}


# The JSON Schema the model must follow. It is written out by hand (rather
# than generated) so it is easy to read and has no $refs, which keeps it
# friendly to constrained decoding in Ollama.
EXTRACTION_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": _nullable_string("Full name as spoken, or null if not said."),
                    "label": _nullable_string(
                        "Only when name is null: a few words to recognize them by, e.g. 'Airbnb designer who climbs'."
                    ),
                    "company": _nullable_string("Company or organization they work at."),
                    "role": _nullable_string("Job title or role, e.g. 'Founder'."),
                    "school": _nullable_string("School or university."),
                    "major": _nullable_string("Field of study."),
                    "metAt": _nullable_string("Event or place where the user met them."),
                    "location": _nullable_string("City or place they are based."),
                    "interests": _string_list("Things they are interested in."),
                    "projects": _string_list("Things they are building or working on."),
                    "needs": _string_list("What they are looking for."),
                    "topicsDiscussed": _string_list("Topics the user and this person talked about."),
                    "notes": _string_list("Other details worth remembering."),
                    "conversation": _string_list(
                        "Detailed notes of the whole conversation with this person, in order, one full sentence each: "
                        "what they said, what the user said, stories, specifics (numbers, places, products, classes, "
                        "people they mentioned), opinions and plans. Empty for voice notes."
                    ),
                    "followUp": _nullable_string("What the user intends to do next with them."),
                },
                "required": [
                    "name", "label", "company", "role", "school", "major", "metAt", "location",
                    "interests", "projects", "needs", "topicsDiscussed", "notes", "conversation", "followUp",
                ],
            },
        }
    },
    "required": ["people"],
}
