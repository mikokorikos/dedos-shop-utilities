import { PermissionFlagsBits } from 'discord.js';

const MODERATOR_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
];

export const hasModeratorAccess = (member) =>
  Boolean(member && MODERATOR_PERMISSIONS.some((perm) => member.permissions?.has?.(perm)));

export const hasAdminAccess = (member) =>
  Boolean(member && member.permissions?.has?.(PermissionFlagsBits.Administrator));

export const ensureGuildMember = async (interaction) => {
  if (interaction.member) return interaction.member;
  if (!interaction.guild) return null;
  try {
    return await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    return null;
  }
};
