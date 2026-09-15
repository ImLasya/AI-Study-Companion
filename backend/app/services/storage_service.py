"""Storage service encapsulating file operations.

For the 3-4 day prototype, uses local filesystem storage under STORAGE_PATH:
  storage/materials/<project_id>/<material_id>/original.pdf

Prevents collisions and enforces directory traversal sanitization.
Structured so future production migration to S3/GCS requires changing only this service.
"""

import re
import shutil
import uuid
from pathlib import Path

from app.core.config import settings


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and invalid filesystem characters."""
    # Strip any directory components
    name = Path(filename).name
    # Remove null bytes and control characters
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    # Remove path traversal tokens like .. or slashes
    name = re.sub(r"\.\.+", ".", name)
    name = re.sub(r'[\\/:*?"<>|]', "_", name)
    # Strip leading/trailing dots and spaces
    name = name.strip(". ")
    if not name:
        name = f"document_{uuid.uuid4().hex[:8]}.pdf"
    return name


class StorageService:
    def __init__(self, base_path: str | None = None) -> None:
        self.base_path = Path(base_path or settings.STORAGE_PATH).resolve()

    def get_material_directory(self, project_id: uuid.UUID, material_id: uuid.UUID) -> Path:
        """Get the isolated directory path for a material."""
        return self.base_path / "materials" / str(project_id) / str(material_id)

    def get_material_file_path(self, project_id: uuid.UUID, material_id: uuid.UUID) -> Path:
        """Get the deterministic path to the stored original PDF file."""
        return self.get_material_directory(project_id, material_id) / "original.pdf"

    def save_file(
        self,
        project_id: uuid.UUID,
        material_id: uuid.UUID,
        content: bytes,
    ) -> str:
        """Save file bytes into isolated storage directory and return relative storage path."""
        target_dir = self.get_material_directory(project_id, material_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        target_file = target_dir / "original.pdf"
        target_file.write_bytes(content)

        # Return standardized relative path for persistence
        return str(target_file.relative_to(self.base_path)).replace("\\", "/")

    def get_absolute_path(self, storage_path: str) -> Path:
        """Resolve a relative storage path to an absolute path."""
        # Enforce that the resolved path is strictly within base_path
        resolved = (self.base_path / storage_path).resolve()
        if not str(resolved).startswith(str(self.base_path)):
            raise ValueError("Path traversal attempt detected in storage path.")
        return resolved

    def delete_material_storage(self, project_id: uuid.UUID, material_id: uuid.UUID) -> None:
        """Delete storage directory for a material if it exists."""
        target_dir = self.get_material_directory(project_id, material_id)
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)


storage_service = StorageService()
