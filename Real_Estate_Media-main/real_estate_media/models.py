
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Client:
    """Represents a client (usually an agent or homeowner)."""
    name: str
    email: str
    phone: Optional[str] = None

    def __post_init__(self):
        if "@" not in self.email:
            raise ValueError("Client email must contain '@'.")


@dataclass
class PropertyListing:
    """Represents a real estate property to be shot."""
    address: str
    city: str
    state: str
    square_feet: int

    def __post_init__(self):
        if self.square_feet <= 0:
            raise ValueError("square_feet must be a positive integer.")


@dataclass
class MediaPackage:
    """Represents a media service package (photo, video, drone, etc.)."""
    name: str
    price: float
    includes_drone: bool = False
    includes_video: bool = False

    def __post_init__(self):
        if self.price < 0:
            raise ValueError("Package price cannot be negative.")


@dataclass
class Booking:
    """Represents a scheduled media shoot for a property."""
    client: Client
    property_listing: PropertyListing
    media_package: MediaPackage
    scheduled_for: datetime
    notes: str = ""
    created_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if self.scheduled_for < datetime.now():
            raise ValueError("Booking cannot be scheduled in the past.")

    def summary(self) -> str:
        return (
            f"Booking for {self.client.name} at {self.property_listing.address}, "
            f"{self.property_listing.city}. Package: {self.media_package.name} "
            f"on {self.scheduled_for.strftime('%Y-%m-%d %H:%M')}."
        )
