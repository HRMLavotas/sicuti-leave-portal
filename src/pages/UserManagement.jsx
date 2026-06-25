import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Edit,
  Trash2,
  UserPlus,
  Shield,
  Mail,
  Calendar,
  Users,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useSimpelUsers } from "@/hooks/useSimpelUsers";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { useDepartments } from "@/hooks/useDepartments";

// Permission Info Component
const PermissionInfo = ({ role }) => {
  const getPermissionInfo = (role) => {
    switch (role) {
      case "admin_pusat":
        return {
          title: "Admin Pusat",
          description: "Full system access - can manage all users, data, and settings",
          permissions: [
            "Dashboard access",
            "All employee data management",
            "All leave requests management", 
            "All leave history access",
            "User management",
            "System settings",
            "Template management",
            "Reports access"
          ]
        };
      case "admin_unit":
        return {
          title: "Admin Unit Kerja",
          description: "Unit-specific access - can only manage data within their assigned unit",
          permissions: [
            "Dashboard access",
            "Employee data (own unit only)",
            "Leave requests (own unit only)",
            "Leave history (own unit only)",
            "Template management (own unit only)",
            "Letter creation (own unit only)"
          ]
        };
      case "employee":
        return {
          title: "Employee",
          description: "Basic access - can view dashboard and submit leave requests",
          permissions: [
            "Dashboard access",
            "Submit leave requests",
            "View own leave history"
          ]
        };
      default:
        return { title: "", description: "", permissions: [] };
    }
  };

  const info = getPermissionInfo(role);

  return (
    <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-4">
      <h3 className="font-semibold text-white mb-2">{info.title}</h3>
      <p className="text-slate-300 text-sm mb-3">{info.description}</p>
      <div className="space-y-1">
        <p className="text-slate-200 text-sm font-medium">Permissions:</p>
        <ul className="text-slate-300 text-sm space-y-1">
          {info.permissions.map((permission, index) => (
            <li key={index} className="flex items-center">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></span>
              {permission}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const UserManagement = () => {
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const { toast } = useToast();
  const { departments, isLoadingDepartments } = useDepartments();
  
  // Use SIMPEL users hook
  const { users, isLoading, updateUser, createUser, deleteUser } = useSimpelUsers();

  useEffect(() => {
    let filtered = users;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (user.unit_kerja || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by role
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, roleFilter]);

  const handleAddUser = async (userData) => {
    // Set permissions based on role
    let permissions = [];
    if (userData.role === "admin_pusat") {
      permissions = ["all"];
    } else if (userData.role === "admin_pimpinan") {
      permissions = ["all_readonly"];
    } else if (userData.role === "admin_unit") {
      permissions = ["dashboard", "employees_unit", "leave_requests_unit", "leave_history_unit", "surat_keterangan_unit"];
    } else {
      permissions = ["dashboard"];
    }

    try {
      await createUser({ ...userData, permissions });
      setIsAddDialogOpen(false);
      toast({ title: "Success", description: "User added successfully" });
    } catch {
      // error already shown by hook
    }
  };

  const handleEditUser = async (userData) => {
    if (!selectedUser) return;
    try {
      await updateUser(selectedUser.id, {
        name: userData.name,
        unit_kerja: userData.department,
        role: userData.role,
      });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    } catch {
      // error already shown by hook
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await deleteUser(userId);
    } catch {
      // error already shown by hook
    }
  };

  const getRoleBadge = (role) => {
    const roleConfig = {
      admin_pusat: { color: "bg-purple-100 text-purple-800", label: "Admin Pusat" },
      admin_unit: { color: "bg-blue-100 text-blue-800", label: "Admin Unit" },
      employee: { color: "bg-green-100 text-green-800", label: "Employee" },
    };
    const config = roleConfig[role] || roleConfig.employee;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          status === "active"
            ? "bg-green-100 text-green-800"
            : "bg-gray-100 text-gray-800"
        }`}
      >
        {status === "active" ? "Active" : "Inactive"}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            User Management
          </h1>
          <p className="text-slate-300">
            Manage user accounts, roles, and permissions
          </p>
          <div className="mt-2 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
              <span className="text-slate-300">Master Admin: Full system access</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-slate-300">Admin Unit: Unit-specific access only</span>
            </div>
          </div>
        </div>
        <div className="flex space-x-2 mt-4 sm:mt-0">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <AddUserDialog onAdd={handleAddUser} />
          </Dialog>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex gap-4 items-center"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-400"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48 bg-slate-800/50 border-slate-700/50 text-white">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-white hover:bg-slate-700">All Roles</SelectItem>
            <SelectItem value="admin_pusat" className="text-white hover:bg-slate-700">Master Admin</SelectItem>
            <SelectItem value="admin_unit" className="text-white hover:bg-slate-700">Admin Unit</SelectItem>
            <SelectItem value="employee" className="text-white hover:bg-slate-700">Employee</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-6"
      >
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Total Users</p>
                <p className="text-2xl font-bold text-white">{users.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Active Users</p>
                <p className="text-2xl font-bold text-white">
                  {users.filter((user) => user.status === "active").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Master Admins</p>
                <p className="text-2xl font-bold text-white">
                  {users.filter((user) => user.role === "admin_pusat").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Admin Units</p>
                <p className="text-2xl font-bold text-white">
                  {users.filter((user) => user.role === "admin_unit").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 font-medium text-slate-300">User</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Username</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Unit Kerja</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Permissions</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-300">Last Login</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30"
                    >
                      <td className="py-4 px-4">
                        <div>
                          <div className="font-medium text-white">{user.name}</div>
                          <div className="text-sm text-slate-400 flex items-center">
                            <Mail className="w-3 h-3 mr-1" />
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-white">{user.username}</td>
                      <td className="py-4 px-4">{getRoleBadge(user.role)}</td>
                      <td className="py-4 px-4 text-white">{user.unit_kerja}</td>
                      <td className="py-4 px-4">{getStatusBadge(user.status)}</td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(user.permissions || []).map((permission, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-slate-600/50 text-slate-300 text-xs rounded-full"
                            >
                              {permission === "all" ? "All Access" : permission.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-400 flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {user.lastLogin}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setIsEditDialogOpen(true);
                            }}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                            className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Edit User</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <EditUserDialog
              user={selectedUser}
              onEdit={handleEditUser}
              onClose={() => {
                setIsEditDialogOpen(false);
                setSelectedUser(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Add User Dialog Component
const AddUserDialog = ({ onAdd }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "employee",
    department: "",
  });
  const { departments, isLoadingDepartments } = useDepartments();

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);
    setFormData({
      name: "",
      email: "",
      username: "",
      password: "",
      role: "employee",
      department: "",
    });
  };

  return (
    <DialogContent className="bg-slate-800 border-slate-700">
      <DialogHeader>
        <DialogTitle className="text-white">Add New User</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {formData.role && <PermissionInfo role={formData.role} />}
        <div>
          <Label htmlFor="name" className="text-slate-300">Full Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
          />
        </div>
        <div>
          <Label htmlFor="username" className="text-slate-300">Username</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
          />
        </div>
        <div>
          <Label htmlFor="password" className="text-slate-300">Password</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
          />
        </div>
        <div>
          <Label htmlFor="email" className="text-slate-300">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
          />
        </div>
        <div>
          <Label htmlFor="role" className="text-slate-300">Role</Label>
          <Select
            value={formData.role}
            onValueChange={(value) => setFormData({ ...formData, role: value })}
          >
            <SelectTrigger id="role" className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="employee" className="text-white hover:bg-slate-600">Employee</SelectItem>
              <SelectItem value="admin_unit" className="text-white hover:bg-slate-600">Admin Unit Kerja</SelectItem>
              <SelectItem value="admin_pusat" className="text-white hover:bg-slate-600">Master Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="department" className="text-slate-300">Unit Kerja</Label>
          <AutocompleteInput
            value={formData.department}
            onChange={(val) => setFormData({ ...formData, department: val })}
            options={departments}
            loading={isLoadingDepartments}
            placeholder="Ketik nama unit..."
          />
        </div>
        <div className="flex justify-end space-x-2">
          <Button type="submit" className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
            Add User
          </Button>
        </div>
      </form>
    </DialogContent>
  );
};

// Edit User Dialog Component
const EditUserDialog = ({ user, onEdit, onClose }) => {
  const { departments, isLoadingDepartments } = useDepartments();

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    username: user.username || "",
    password: "",
    role: user.role,
    department: user.department,
    status: user.status,
  });

  console.log("EditUserDialog initialized with user:", { id: user.id, name: user.name, department: user.department });
  console.log("Form data department:", formData.department);

  const handleSubmit = (e) => {
    e.preventDefault();
    onEdit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PermissionInfo role={formData.role} />
      <div>
        <Label htmlFor="edit-name" className="text-slate-300">Full Name</Label>
        <Input
          id="edit-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
        />
      </div>
      <div>
        <Label htmlFor="edit-username" className="text-slate-300">Username</Label>
        <Input
          id="edit-username"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
        />
      </div>
      <div>
        <Label htmlFor="edit-password" className="text-slate-300">Password</Label>
        <Input
          id="edit-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
        />
        <span className="text-xs text-slate-400">Kosongkan jika tidak ingin mengubah password.</span>
      </div>
      <div>
        <Label htmlFor="edit-email" className="text-slate-300">Email</Label>
        <Input
          id="edit-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
        />
      </div>
      <div>
        <Label htmlFor="edit-role" className="text-slate-300">Role</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => setFormData({ ...formData, role: value })}
        >
          <SelectTrigger id="edit-role" className="bg-slate-700 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="employee" className="text-white hover:bg-slate-600">Employee</SelectItem>
            <SelectItem value="admin_unit" className="text-white hover:bg-slate-600">Admin Unit Kerja</SelectItem>
            <SelectItem value="admin_pusat" className="text-white hover:bg-slate-600">Master Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="edit-department" className="text-slate-300">Unit Kerja</Label>
        <AutocompleteInput
          value={formData.department}
          onChange={(val) => setFormData({ ...formData, department: val })}
          options={departments}
          loading={isLoadingDepartments}
          placeholder="Ketik nama unit..."
        />
      </div>
      <div>
        <Label htmlFor="edit-status" className="text-slate-300">Status</Label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value })}
        >
          <SelectTrigger id="edit-status" className="bg-slate-700 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="active" className="text-white hover:bg-slate-600">Active</SelectItem>
            <SelectItem value="inactive" className="text-white hover:bg-slate-600">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
          Cancel
        </Button>
        <Button type="submit" className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
          Update User
        </Button>
      </div>
    </form>
  );
};

export default UserManagement;
